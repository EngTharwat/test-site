'use client'

import { useState, useEffect, useCallback, use } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import type { MappedSegment } from './map/LeafletMap'
import { zoneColor } from './map/LeafletMap'

// Embed the Leaflet map (browser-only)
const LeafletMap = dynamic(() => import('./map/LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
      <span className="text-[#6B7280] dark:text-gray-400 text-sm animate-pulse">Loading map…</span>
    </div>
  ),
})

// Activity colors for the embedded map's last-activity coloring
const OV_ACTIVITIES = [
  { key: 'excavation',  color: '#ef4444' },
  { key: 'piping',      color: '#2563FF' },
  { key: 'backfilling', color: '#eab308' },
  { key: 'basecourse',  color: '#22c55e' },
  { key: 'asphalt',     color: '#111827' },
] as const
function lastActivityColorOV(seg: Segment): string {
  let idx = -1
  OV_ACTIVITIES.forEach((a, i) => { if (((seg as any)[a.key]?.pct ?? 0) >= 100) idx = i })
  return idx >= 0 ? OV_ACTIVITIES[idx].color : '#9ca3af'
}
const hasCoordsOV = (s: Segment) =>
  s.startLat != null && s.startLng != null && s.endLat != null && s.endLng != null
const pctColor = (p: number) => p >= 80 ? '#22c55e' : p >= 40 ? '#f97316' : '#2563FF'
import {
  Project, Zone, Segment, Permit, BoqItem, Invoice,
  ProjectStatus, ProjectType, Currency,
  STATUS_LABELS, STATUS_COLORS, PROJECT_TYPE_LABELS,
  ACTIVITY_KEYS, formatCurrency, formatLength, daysRemaining, fmtN,
  CURRENCIES, PROJECT_TYPES, PROJECT_STATUSES,
  ZONE_TYPES_BY_PROJECT, permitExpiryState, isHandedOver,
} from '@/lib/types'

// ── Tiny shared components ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ProjectStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function KpiCard({ label, value, sub, accent, icon }: {
  label: string; value: string; sub?: string; accent?: string; icon?: string
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-semibold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">{label}</div>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className="text-2xl font-bold tracking-[-0.5px] dark:text-white mt-1" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-[11px] text-[#6B7280] dark:text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function Bar({ pct, color = '#2563FF', height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div className="bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

// ── Simple donut chart (SVG, no deps) ─────────────────────────────────────────
function DonutChart({ data, size = 110 }: {
  data: { label: string; value: number; color: string }[]
  size?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <span className="text-[11px] text-[#9CA3AF]">0</span>
      </div>
    </div>
  )

  const r = 40
  const cx = 55, cy = 55
  const circumference = 2 * Math.PI * r
  let offset = circumference / 4  // start from top

  return (
    <svg width={size} height={size} viewBox="0 0 110 110">
      {data.map((d, i) => {
        if (!d.value) return null
        const dash = (d.value / total) * circumference
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={d.color} strokeWidth="18"
            strokeDasharray={`${dash} ${circumference}`}
            strokeDashoffset={offset}
          />
        )
        offset -= dash
        return el
      })}
      {/* inner white circle */}
      <circle cx={cx} cy={cy} r="29" fill="white" className="dark:fill-gray-900" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13" fontWeight="700"
        fill="#0F1115" className="dark:fill-white">
        {Math.round((data[0]?.value / total) * 100)}%
      </text>
    </svg>
  )
}

// ── Progress ring (single %, SVG) ─────────────────────────────────────────────
function RingStat({ pct, size = 96, stroke = 10, color }: {
  pct: number; size?: number; stroke?: number; color?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const dash = (clamped / 100) * c
  const ringColor = color ?? pctColor(clamped)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        className="stroke-gray-100 dark:stroke-gray-800" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .4s ease' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fontSize={size * 0.26} fontWeight="700" fill="currentColor" className="text-black dark:text-white">
        {clamped}%
      </text>
    </svg>
  )
}

// ── Input class ───────────────────────────────────────────────────────────────
const inputCls  = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const selectCls = inputCls + ' cursor-pointer'

// ── Edit Modal ────────────────────────────────────────────────────────────────
interface BreakdownEntry { type: string; length: string }

type EditForm = {
  name: string; client: string; contractor: string; consultant: string; location: string
  projectType: ProjectType; contractValue: string; currency: Currency
  contractStartDate: string; contractEndDate: string
  status: ProjectStatus; description: string
}

function EditProjectModal({ project, onClose, onSaved }: {
  project: Project; onClose: () => void; onSaved: (p: Project) => void
}) {
  const [form, setForm] = useState<EditForm>({
    name:              project.name,
    client:            project.client      || '',
    contractor:        project.contractor  || '',
    consultant:        project.consultant  || '',
    location:          project.location    || '',
    projectType:       project.projectType,
    contractValue:     String(project.contractValue || 0),
    currency:          project.currency,
    contractStartDate: project.contractStartDate || '',
    contractEndDate:   project.contractEndDate   || '',
    status:            project.status,
    description:       project.description || '',
  })

  // Populate breakdown from existing project data (new array or legacy fixed fields)
  const initBreakdown = (): BreakdownEntry[] => {
    if (project.breakdownEntries?.length) {
      return project.breakdownEntries.map(e => ({ type: e.type, length: String(e.length) }))
    }
    // Migrate from legacy fixed fields
    const legacy: BreakdownEntry[] = []
    if (project.gravityLength)          legacy.push({ type: 'Gravity',           length: String(project.gravityLength) })
    if (project.forcemainLength)        legacy.push({ type: 'Force Main',         length: String(project.forcemainLength) })
    if (project.houseConnectionsLength) legacy.push({ type: 'House Connections',  length: String(project.houseConnectionsLength) })
    return legacy.length ? legacy : [{ type: '', length: '' }]
  }

  const [breakdown, setBreakdown] = useState<BreakdownEntry[]>(initBreakdown)
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const set = (k: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const typeOptions = ZONE_TYPES_BY_PROJECT[form.projectType] ?? ZONE_TYPES_BY_PROJECT.other
  const totalNetworkLength = breakdown.reduce((s, r) => s + (Number(r.length) || 0), 0)

  function setBreakdownRow(idx: number, key: keyof BreakdownEntry, value: string) {
    setBreakdown(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r))
  }

  function handleProjectTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setForm(f => ({ ...f, projectType: e.target.value as ProjectType }))
    setBreakdown(prev => prev.map(r => ({ ...r, type: '' })))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErr('')
    try {
      const entries = breakdown
        .filter(r => r.type && Number(r.length) > 0)
        .map(r => ({ type: r.type, length: Number(r.length) }))

      const updated = await api.patch(`/api/projects/${project.id}`, {
        ...form,
        contractValue:    Number(form.contractValue) || 0,
        totalNetworkLength,
        breakdownEntries: entries,
      })
      onSaved(updated)
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-10 px-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-2xl mb-10"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-[15px] font-bold text-black dark:text-white">Edit Project</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-black dark:hover:text-white text-xl">×</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Project Name *</label>
            <input className={inputCls} required value={form.name} onChange={set('name')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Client</label><input className={inputCls} value={form.client} onChange={set('client')} /></div>
            <div><label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Contractor</label><input className={inputCls} value={form.contractor} onChange={set('contractor')} /></div>
            <div><label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Consultant</label><input className={inputCls} value={form.consultant} onChange={set('consultant')} /></div>
            <div><label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Location</label><input className={inputCls} value={form.location} onChange={set('location')} /></div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Project Type</label>
              <select className={selectCls} value={form.projectType} onChange={handleProjectTypeChange}>
                {PROJECT_TYPES.map(t => <option key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Status</label>
              <select className={selectCls} value={form.status} onChange={set('status')}>
                {PROJECT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div><label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Contract Value</label><input className={inputCls} type="number" min="0" step="any" value={form.contractValue} onChange={set('contractValue')} /></div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Currency</label>
              <select className={selectCls} value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Start Date</label><input className={inputCls} type="date" value={form.contractStartDate} onChange={set('contractStartDate')} /></div>
            <div><label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">End Date</label><input className={inputCls} type="date" value={form.contractEndDate} onChange={set('contractEndDate')} /></div>
          </div>

          {/* Dynamic breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-[#374151] dark:text-gray-300">Project Length Breakdown</p>
              {totalNetworkLength > 0 && (
                <span className="text-[11px] font-semibold text-[#2563FF]">Total: {totalNetworkLength.toLocaleString()} m</span>
              )}
            </div>
            <div className="space-y-2">
              {breakdown.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    className={selectCls + ' flex-1'}
                    value={row.type}
                    onChange={e => setBreakdownRow(idx, 'type', e.target.value)}
                  >
                    <option value="">— Select Type —</option>
                    {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    className={inputCls + ' w-36'}
                    type="number" min="0" step="1"
                    placeholder="Length (m)"
                    value={row.length}
                    onChange={e => setBreakdownRow(idx, 'length', e.target.value)}
                  />
                  <button type="button"
                    onClick={() => setBreakdown(prev => prev.filter((_, i) => i !== idx))}
                    disabled={breakdown.length === 1}
                    className="text-[#9CA3AF] hover:text-red-500 disabled:opacity-30 text-lg leading-none flex-shrink-0">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button"
              onClick={() => setBreakdown(prev => [...prev, { type: '', length: '' }])}
              className="mt-2 text-[11px] font-semibold text-[#2563FF] hover:text-[#1d4fd8] transition-colors">
              + Add Row
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Description</label>
            <textarea className={inputCls + ' resize-none'} rows={3} value={form.description} onChange={set('description')} />
          </div>
          {err && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-4 py-2 rounded-lg">{err}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-[#6B7280] hover:text-black dark:hover:text-white transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()

  const isAdmin = profile?.isAdmin ?? false
  const pagePerm = (!isAdmin && profile?.permissions)
    ? getProjectPagePermissions(profile.permissions, projectId) : null
  const canEdit     = isAdmin || pagePerm?.overview === 'edit'
  const canSeeZones = isAdmin || (pagePerm && pagePerm.zones !== 'none')
  const canSeeBoq   = isAdmin || (pagePerm && (pagePerm.boq ?? 'none') !== 'none')
  const canSeeInv   = isAdmin || (pagePerm && (pagePerm.invoices ?? 'none') !== 'none')

  const [project,  setProject]  = useState<Project | null>(null)
  const [zones,    setZones]    = useState<Zone[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [permits,  setPermits]  = useState<Permit[]>([])
  const [permitsLoaded, setPermitsLoaded] = useState(false)
  const [boq,      setBoq]      = useState<BoqItem[]>([])
  const [boqLoaded, setBoqLoaded] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invLoaded, setInvLoaded] = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,    setError]    = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Embedded map is filtered to a single Area (slicer). An Area is a distinct
  // zone name and may contain several scopes. '' until data loads.
  const [mapArea, setMapArea] = useState<string>('')

  // Theme for the embedded map tiles
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const [proj, zoneData, segData] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/projects/${projectId}/zones`),
        api.get(`/api/projects/${projectId}/segments`),
      ])
      setProject(proj); setZones(zoneData); setSegments(segData)
      // Permits are optional (member may lack access) — never block the page.
      api.get(`/api/projects/${projectId}/permits`).then(d => { setPermits(d); setPermitsLoaded(true) }).catch(() => { setPermits([]); setPermitsLoaded(true) })
      // BOQ + Invoices can be large — don't read them on every Overview load.
      // Reuse them only if another page already cached them; otherwise they
      // load on demand (button) to keep Firestore reads low.
      const cb = api.peekCache(`/api/projects/${projectId}/boq`)
      if (cb !== undefined) { setBoq(cb as BoqItem[]); setBoqLoaded(true) }
      const ci = api.peekCache(`/api/projects/${projectId}/invoices`)
      if (ci !== undefined) { setInvoices(ci as Invoice[]); setInvLoaded(true) }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // On-demand loaders for the heavy panels
  const loadBoq = useCallback(async () => {
    try { setBoq(await api.get(`/api/projects/${projectId}/boq`)); setBoqLoaded(true) } catch { /* ignore */ }
  }, [projectId])
  const loadInvoices = useCallback(async () => {
    try { setInvoices(await api.get(`/api/projects/${projectId}/invoices`)); setInvLoaded(true) } catch { /* ignore */ }
  }, [projectId])

  // Refresh — bypass the cache and re-read everything currently shown.
  const refresh = useCallback(async () => {
    setRefreshing(true)
    const reBoq = boqLoaded, reInv = invLoaded
    api.clearCache()
    try {
      await fetchAll()
      if (reBoq) await loadBoq()
      if (reInv) await loadInvoices()
    } finally { setRefreshing(false) }
  }, [fetchAll, loadBoq, loadInvoices, boqLoaded, invLoaded])

  // Default the map slicer to the Area with the most mapped segments (so the
  // map opens on something), else the first area that has a point facility.
  useEffect(() => {
    if (mapArea || !zones.length) return
    const zoneName = Object.fromEntries(zones.map(z => [z.id, z.name]))
    const counts: Record<string, number> = {}
    segments.forEach(s => {
      if (!hasCoordsOV(s)) return
      const name = zoneName[s.zoneId]; if (!name) return
      counts[name] = (counts[name] || 0) + 1
    })
    let best = '', bestN = 0
    Object.entries(counts).forEach(([name, n]) => { if (n > bestN) { bestN = n; best = name } })
    if (!best) {
      const fac = zones.find(z => z.linear === false && z.lat != null && z.lng != null)
      best = fac?.name ?? ''
    }
    if (best) setMapArea(best)
  }, [zones, segments, mapArea])

  async function handleDelete() {
    if (!project || !confirm(`Delete "${project.name}"?\n\nAll data will be permanently removed.`)) return
    setDeleting(true)
    try {
      await api.delete(`/api/projects/${projectId}`)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="p-8 space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}
    </div>
  )
  if (error || !project) return <div className="p-8"><p className="text-red-500">{error || 'Project not found'}</p></div>

  // ── Derived stats ──────────────────────────────────────────────────────────
  const days      = project.contractEndDate ? daysRemaining(project.contractEndDate) : null
  const totalSegs = segments.length
  const asphaltSegs = segments.filter(s => (s.surfaceType ?? ((s.asphaltThickness ?? 0) > 0 ? 'asphalt' : 'dirt')) === 'asphalt').length
  const dirtSegs    = totalSegs - asphaltSegs

  // Activity completion (% of segments with that activity done)
  const actStats = ACTIVITY_KEYS.map(act => {
    const done = segments.filter(s => ((s as any)[act.key]?.pct ?? 0) >= 100).length
    return { ...act, done, pct: totalSegs > 0 ? Math.round((done / totalSegs) * 100) : 0 }
  })

  // Per-zone segment count and progress
  const zoneStats = zones.map(zone => {
    const zSegs    = segments.filter(s => s.zoneId === zone.id)
    const avgPct   = zSegs.length ? Math.round(zSegs.reduce((s, seg) => s + (seg.overallPct || 0), 0) / zSegs.length) : 0
    const totalLen = zSegs.reduce((s, seg) => s + (seg.length || 0), 0)
    return { ...zone, segCount: zSegs.length, avgPct, totalLen }
  })

  // Group zones by scope/type — the same zone name can exist under several
  // scopes (e.g. Gravity and Force Main), so each scope gets its own table.
  const zonesByType: Record<string, typeof zoneStats> = {}
  zoneStats.forEach(z => {
    const t = z.type || 'Untyped'
    ;(zonesByType[t] ??= []).push(z)
  })
  const scopeKeys = Object.keys(zonesByType).sort()

  // Permit stats for the overview KPI. Handed-over permits are "finished" —
  // excluded from expiry buckets and counted on their own.
  const permitState = (p: Permit) =>
    isHandedOver(p.excavation) ? 'handed_over' : permitExpiryState(p.expiryDate)
  const permitStats = {
    total:      permits.length,
    active:     permits.filter(p => permitState(p) === 'valid').length,
    expiring:   permits.filter(p => permitState(p) === 'soon').length,
    expired:    permits.filter(p => permitState(p) === 'expired').length,
    handedOver: permits.filter(p => permitState(p) === 'handed_over').length,
  }

  // Segments with GIS coordinates → embedded map
  const zoneMap = Object.fromEntries(zones.map(z => [z.id, z]))
  const mappedSegments: MappedSegment[] = segments
    .filter(s => s.startLat != null && s.startLng != null && s.endLat != null && s.endLng != null)
    .map(s => {
      const z = zoneMap[s.zoneId]
      return {
        ...s,
        zoneName:  z?.name ?? '—',
        zoneType:  z?.type ?? '',
        zoneColor: lastActivityColorOV(s),
      }
    })

  // Overall project progress from segments
  const projectPct = totalSegs > 0
    ? Math.round(segments.reduce((s, seg) => s + (seg.overallPct || 0), 0) / totalSegs)
    : project.completionPct || 0
  const executedLength = segments.reduce((s, seg) => s + (seg.length || 0) * (seg.overallPct || 0) / 100, 0)
  const totalSegLength = segments.reduce((s, seg) => s + (seg.length || 0), 0)

  // ── Areas ───────────────────────────────────────────────────────────────────
  // An Area is a distinct zone name; it may hold several scopes (Gravity, Force
  // Main…). Counts of areas use distinct names — never the number of scopes.
  const areaNames = [...new Set(zones.map(z => z.name).filter(Boolean))]
  const areaCount = areaNames.length

  // ── Area-filtered map (slicer) ──────────────────────────────────────────────
  // Areas that have something to draw: mapped segments, or a point facility.
  const mappedZoneIds   = new Set(mappedSegments.map(s => s.zoneId))
  const facilityZones   = zones.filter(z => z.linear === false && z.lat != null && z.lng != null)
  const drawableNames   = new Set<string>()
  zones.forEach(z => {
    if (!z.name) return
    if (mappedZoneIds.has(z.id) || (z.linear === false && z.lat != null && z.lng != null)) {
      drawableNames.add(z.name)
    }
  })
  const mapAreaOptions = areaNames.filter(n => drawableNames.has(n))
  // Fall back to the first option until the default effect sets the state, so
  // the slicer is never in an unmatched/empty state on the first render.
  const activeArea = mapArea || mapAreaOptions[0] || ''

  // All scopes (zone docs) that make up the selected area
  const areaZones     = zones.filter(z => z.name === activeArea)
  const areaScopes    = [...new Set(areaZones.map(z => z.type).filter(Boolean))]
  const areaZoneIds   = new Set(areaZones.map(z => z.id))
  const areaMapped    = mappedSegments.filter(s => areaZoneIds.has(s.zoneId))
  const areaFacs      = areaZones
    .filter(z => z.linear === false && z.lat != null && z.lng != null)
    .map(z => ({ id: z.id, name: z.name, type: z.type || 'Facility',
                 lat: z.lat!, lng: z.lng!, color: zoneColor(z.type ?? '') }))

  // Aggregate stats across every scope in the selected area
  const areaSegsAll   = segments.filter(s => areaZoneIds.has(s.zoneId))
  const areaLen       = areaSegsAll.reduce((s, seg) => s + (seg.length || 0), 0)
  const areaPct       = areaSegsAll.length
    ? Math.round(areaSegsAll.reduce((s, seg) => s + (seg.overallPct || 0), 0) / areaSegsAll.length)
    : 0
  const areaActStats  = ACTIVITY_KEYS.map(act => {
    const done = areaSegsAll.filter(s => ((s as any)[act.key]?.pct ?? 0) >= 100).length
    return { ...act, done, pct: areaSegsAll.length ? Math.round(done / areaSegsAll.length * 100) : 0 }
  })

  // ── BOQ stats ────────────────────────────────────────────────────────────────
  const boqTotal  = boq.reduce((s, it) => s + (it.totalPrice || 0), 0)
  const boqCount  = boq.length
  // Break the BOQ value down by Scope — Area (area omitted when an item has none).
  const boqGroupKey = (it: BoqItem) => {
    const scope = it.scope || '—'
    return it.area ? `${scope} — ${it.area}` : scope
  }
  const boqBreakdown = (() => {
    const map = new Map<string, number>()
    boq.forEach(it => map.set(boqGroupKey(it), (map.get(boqGroupKey(it)) || 0) + (it.totalPrice || 0)))
    const all = [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
    // Keep the list readable when there are many scope/area combinations.
    if (all.length <= 12) return all
    const top  = all.slice(0, 11)
    const rest = all.slice(11).reduce((s, x) => s + x.value, 0)
    return [...top, { label: `Others (${all.length - 11})`, value: rest }]
  })()
  const BOQ_PALETTE = ['#2563FF','#7C3AED','#22c55e','#f97316','#ef4444','#eab308','#06b6d4','#0891b2','#6366f1']
  // BOQ value as a share of the contract value (when both are known)
  const boqVsContractPct = project.contractValue > 0 ? Math.round(boqTotal / project.contractValue * 100) : null

  // ── Invoice stats ──────────────────────────────────────────────────────────
  const invTotal     = invoices.reduce((s, iv) => s + (iv.total || 0), 0)
  const invPaid      = invoices.filter(iv => iv.paid).reduce((s, iv) => s + (iv.total || 0), 0)
  const invPending   = invTotal - invPaid
  const invCount     = invoices.length
  // Invoiced as a share of the contract value (billing progress)
  const invVsContractPct = project.contractValue > 0 ? Math.round(invTotal / project.contractValue * 100) : null
  // Histogram: invoices in ascending No. order, scaled to the largest invoice
  const invSorted = [...invoices].sort((a, b) =>
    (a.number || '').localeCompare(b.number || '', undefined, { numeric: true, sensitivity: 'base' }))
  const invMax = Math.max(1, ...invSorted.map(iv => iv.total || 0))

  // ── Completion vs BOQ (from invoices) ───────────────────────────────────────
  // Invoiced value per BOQ item = Σ of its line amounts across every invoice.
  const invoicedByBoq = (() => {
    const m = new Map<string, number>()
    invoices.forEach(iv => (iv.lines || []).forEach(l => {
      if (!l.boqId) return
      m.set(l.boqId, (m.get(l.boqId) || 0) + (l.amount || 0))
    }))
    return m
  })()
  const boqVal = (it: BoqItem) => it.totalPrice || 0
  const invVal = (id: string) => invoicedByBoq.get(id) || 0

  // Table 1 — completion % by Area (fallback Scope when an item has no area)
  const areaCompletion = (() => {
    const m = new Map<string, { contract: number; invoiced: number }>()
    boq.forEach(it => {
      const key = it.area || it.scope || '—'
      const g = m.get(key) ?? m.set(key, { contract: 0, invoiced: 0 }).get(key)!
      g.contract += boqVal(it); g.invoiced += invVal(it.id)
    })
    return [...m.entries()]
      .map(([label, g]) => ({ label, contract: g.contract, invoiced: g.invoiced, pct: g.contract ? Math.round(g.invoiced / g.contract * 100) : 0 }))
      .sort((a, b) => b.contract - a.contract)
  })()
  const acContract = areaCompletion.reduce((s, r) => s + r.contract, 0)
  const acInvoiced = areaCompletion.reduce((s, r) => s + r.invoiced, 0)
  const acPct = acContract ? Math.round(acInvoiced / acContract * 100) : 0

  // Table 2 — building × area matrix (items that carry a building, e.g. stations)
  const buildingItems  = boq.filter(it => it.building)
  const matrixBuildings = [...new Set(buildingItems.map(it => it.building as string))]
  const matrixAreas     = [...new Set(buildingItems.map(it => it.area || '—'))]
  const cellMap = (() => {
    const m = new Map<string, { contract: number; invoiced: number }>()
    buildingItems.forEach(it => {
      const k = `${it.building}|||${it.area || '—'}`
      const g = m.get(k) ?? m.set(k, { contract: 0, invoiced: 0 }).get(k)!
      g.contract += boqVal(it); g.invoiced += invVal(it.id)
    })
    return m
  })()
  const cell = (b: string, a: string) => cellMap.get(`${b}|||${a}`)
  const completionLoaded = boqLoaded && invLoaded
  const pColor = (p: number) => p >= 80 ? '#22c55e' : p >= 40 ? '#14b8a6' : '#0ea5a4'

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">

      {/* ── Project Header ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Title + badges */}
            <h1 className="text-lg md:text-xl font-bold text-black dark:text-white tracking-[-0.4px] mb-2 break-words">
              {project.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <StatusBadge status={project.status} />
              <span className="text-[11px] text-[#6B7280] dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                {PROJECT_TYPE_LABELS[project.projectType]}
              </span>
            </div>

            {/* Meta — one item per line on mobile, inline-wrap on desktop */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-y-1 sm:gap-x-5 text-[12px] text-[#6B7280] dark:text-gray-400 mb-2">
              {project.client     && <span className="truncate">👤 {project.client}</span>}
              {project.contractor && <span className="truncate">🏗 {project.contractor}</span>}
              {project.consultant && <span className="truncate">📐 {project.consultant}</span>}
              {project.location   && <span className="truncate">📍 {project.location}</span>}
            </div>
            {project.contractStartDate && project.contractEndDate && (
              <p className="text-[12px] text-[#6B7280] dark:text-gray-400">
                📅 <span className="whitespace-nowrap">{project.contractStartDate}</span> →{' '}
                <span className="whitespace-nowrap">{project.contractEndDate}</span>
                {days !== null && (
                  <span className={`ml-2 font-semibold whitespace-nowrap ${days < 0 ? 'text-red-500' : days < 30 ? 'text-orange-500' : 'text-[#6B7280] dark:text-gray-400'}`}>
                    ({days >= 0 ? `${fmtN(days)} days left` : `${fmtN(Math.abs(days))} days overdue`})
                  </span>
                )}
              </p>
            )}
            {project.description && <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-1">{project.description}</p>}
          </div>

          {/* Actions — own row on mobile, equal-width tap targets; inline on desktop */}
          <div className="flex items-center gap-2 flex-shrink-0 border-t md:border-t-0 border-gray-100 dark:border-gray-800 pt-3 md:pt-0">
            <button onClick={refresh} disabled={refreshing} title="Reload latest data (bypasses cache)"
              className="flex-1 md:flex-none text-sm font-semibold text-[#374151] dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-2 rounded-lg disabled:opacity-50 transition-colors">
              {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
            </button>
            {canEdit && (
              <>
                <button onClick={() => setEditOpen(true)}
                  className="flex-1 md:flex-none text-sm font-semibold text-[#374151] dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors">
                  Edit
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 md:flex-none text-sm font-semibold text-red-500 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors">
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
            {canSeeZones && (
              <button onClick={() => router.push(`/projects/${projectId}/zones`)}
                className="flex-1 md:flex-none whitespace-nowrap text-sm font-semibold text-white bg-black dark:bg-white dark:text-black hover:bg-[#0F1115] dark:hover:bg-gray-100 px-4 py-2 rounded-lg transition-colors">
                Manage Zones →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Contract Value"   icon="💰"
          value={formatCurrency(project.contractValue, project.currency)} sub={project.currency} />
        <KpiCard label="Project Length"   icon="📏"
          value={formatLength(project.totalNetworkLength)}
          sub={`${formatLength(executedLength)} executed`} />

        {/* Overall progress — ring + breakdown */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 flex items-center gap-4">
          <RingStat pct={projectPct} size={72} stroke={8} />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Overall Progress</div>
            <div className="text-[12px] text-black dark:text-white font-semibold">{areaCount} area{areaCount !== 1 ? 's' : ''} · {totalSegs} segs</div>
            <div className="text-[11px] text-[#6B7280] dark:text-gray-400">
              {zones.length} scope{zones.length !== 1 ? 's' : ''}
              {facilityZones.length > 0 && ` · 🏢 ${facilityZones.length}`}
            </div>
          </div>
        </div>

        <KpiCard label="Days Remaining"   icon={days !== null && days < 0 ? '⚠️' : '📅'}
          value={days !== null ? `${fmtN(Math.abs(days))}` : '—'}
          sub={days === null ? 'No end date' : days < 0 ? 'Days overdue' : 'Days left'}
          accent={days !== null && days < 0 ? '#ef4444' : days !== null && days < 30 ? '#f97316' : undefined} />
      </div>

      {/* ── Permits summary ──────────────────────────────────────────────── */}
      {permitStats.total > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">📄 Permits</h2>
            <button onClick={() => router.push(`/projects/${projectId}/permits`)}
              className="text-[11px] text-[#2563FF] hover:underline">View all →</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total',        value: permitStats.total,      accent: undefined as string | undefined },
              { label: 'Active',       value: permitStats.active,     accent: '#22c55e' },
              { label: 'Expiring ≤30d',value: permitStats.expiring,   accent: permitStats.expiring ? '#f97316' : undefined },
              { label: 'Expired',      value: permitStats.expired,    accent: permitStats.expired ? '#ef4444' : undefined },
              { label: 'Handed Over',  value: permitStats.handedOver, accent: permitStats.handedOver ? '#06b6d4' : undefined },
            ].map(s => (
              <div key={s.label}>
                <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
                <div className="text-2xl font-bold tracking-[-0.5px] dark:text-white" style={{ color: s.accent }}>{s.value}</div>
              </div>
            ))}
          </div>
          {(permitStats.expired > 0 || permitStats.expiring > 0) && (
            <p className="text-[11px] text-[#6B7280] dark:text-gray-400 mt-3">
              {permitStats.expired > 0 && <span className="text-red-500 font-semibold">{permitStats.expired} expired</span>}
              {permitStats.expired > 0 && permitStats.expiring > 0 && ' · '}
              {permitStats.expiring > 0 && <span className="text-orange-500 font-semibold">{permitStats.expiring} expiring soon</span>}
              {' — review before excavation continues.'}
            </p>
          )}
        </div>
      )}

      {/* ── BOQ summary (loaded on demand to save reads) ───────────────────── */}
      {canSeeBoq && !boqLoaded && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">🧾 Bill of Quantities</span>
            <span className="text-[11px] text-[#6B7280] dark:text-gray-400">summary not loaded</span>
          </div>
          <button onClick={loadBoq}
            className="text-[12px] font-semibold text-[#2563FF] border border-[#2563FF]/40 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-3 py-1.5 rounded-lg transition-colors">
            Load summary
          </button>
        </div>
      )}
      {canSeeBoq && boqLoaded && boqCount > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">🧾 Bill of Quantities</h2>
            <button onClick={() => router.push(`/projects/${projectId}/boq`)}
              className="text-[11px] text-[#2563FF] hover:underline">View BOQ →</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Headline numbers */}
            <div className="lg:col-span-1 flex flex-col justify-center gap-3 lg:border-r border-gray-100 dark:border-gray-800 lg:pr-5">
              <div>
                <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Total BOQ Value</div>
                <div className="text-2xl font-bold tracking-[-0.5px] text-black dark:text-white">{formatCurrency(boqTotal, project.currency)}</div>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Items</div>
                  <div className="text-[15px] font-bold text-black dark:text-white">{fmtN(boqCount)}</div>
                </div>
                {boqVsContractPct !== null && (
                  <div>
                    <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">of Contract</div>
                    <div className="text-[15px] font-bold text-black dark:text-white">{boqVsContractPct}%</div>
                  </div>
                )}
              </div>
            </div>

            {/* Breakdown by trade (or scope) */}
            <div className="lg:col-span-2">
              <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-2.5">
                Value by Scope / Area
              </div>
              <div className="space-y-3">
                {boqBreakdown.map((b, i) => {
                  const pct = boqTotal > 0 ? Math.round(b.value / boqTotal * 100) : 0
                  const color = BOQ_PALETTE[i % BOQ_PALETTE.length]
                  return (
                    <div key={b.label}>
                      <div className="flex justify-between text-[12px] mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="font-semibold text-black dark:text-white truncate">{b.label}</span>
                        </div>
                        <span className="text-[#6B7280] dark:text-gray-400 whitespace-nowrap ml-2">
                          {formatCurrency(b.value, project.currency)} · {pct}%
                        </span>
                      </div>
                      <Bar pct={pct} color={color} height={8} />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoices summary (loaded on demand to save reads) ──────────────── */}
      {canSeeInv && !invLoaded && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">🧾 Invoices</span>
            <span className="text-[11px] text-[#6B7280] dark:text-gray-400">summary not loaded</span>
          </div>
          <button onClick={loadInvoices}
            className="text-[12px] font-semibold text-[#2563FF] border border-[#2563FF]/40 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-3 py-1.5 rounded-lg transition-colors">
            Load summary
          </button>
        </div>
      )}
      {canSeeInv && invLoaded && invCount > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">🧾 Invoices</h2>
            <button onClick={() => router.push(`/projects/${projectId}/invoices`)}
              className="text-[11px] text-[#2563FF] hover:underline">View invoices →</button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Total Invoiced</div>
              <div className="text-2xl font-bold tracking-[-0.5px] text-black dark:text-white">{formatCurrency(invTotal, project.currency)}</div>
              <div className="text-[11px] text-[#6B7280] dark:text-gray-400 mt-0.5">{invCount} invoice{invCount !== 1 ? 's' : ''}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">% of Contract</div>
              <div className="text-2xl font-bold tracking-[-0.5px]" style={{ color: pctColor(invVsContractPct ?? 0) }}>
                {invVsContractPct !== null ? `${invVsContractPct}%` : '—'}
              </div>
              <div className="text-[11px] text-[#6B7280] dark:text-gray-400 mt-0.5">of {formatCurrency(project.contractValue, project.currency)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Paid</div>
              <div className="text-2xl font-bold tracking-[-0.5px] text-green-600 dark:text-green-400">{formatCurrency(invPaid, project.currency)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Pending</div>
              <div className="text-2xl font-bold tracking-[-0.5px] text-amber-600 dark:text-amber-400">{formatCurrency(invPending, project.currency)}</div>
            </div>
          </div>

          {/* Invoiced vs contract progress */}
          {invVsContractPct !== null && (
            <div className="mb-5">
              <div className="flex justify-between text-[11px] text-[#6B7280] dark:text-gray-400 mb-1.5">
                <span>Billed to date</span>
                <span>{invVsContractPct}% of contract</span>
              </div>
              <Bar pct={invVsContractPct} color="#2563FF" height={8} />
            </div>
          )}

          {/* Columns histogram — one bar per invoice (paid green / pending amber) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Invoice Amounts</div>
              <div className="flex items-center gap-3 text-[10px] text-[#6B7280] dark:text-gray-400">
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#22c55e' }} /> Paid</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#f59e0b' }} /> Pending</span>
              </div>
            </div>
            <div className="flex items-end gap-1.5" style={{ height: 120 }}>
              {invSorted.map(iv => (
                <div key={iv.id} className="flex-1 rounded-t min-w-[3px] transition-all hover:opacity-80"
                  title={`${iv.number} · ${iv.date || ''} · ${formatCurrency(iv.total || 0, project.currency)}${iv.paid ? ' · paid' : ' · pending'}`}
                  style={{ height: `${Math.max(2, Math.round((iv.total || 0) / invMax * 100))}%`, background: iv.paid ? '#22c55e' : '#f59e0b' }} />
              ))}
            </div>
            <div className="flex gap-1.5 mt-1">
              {invSorted.map(iv => (
                <span key={iv.id} className="flex-1 min-w-[3px] text-[8px] text-center text-[#9CA3AF] dark:text-gray-500 truncate">{iv.number}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Completion matrices (invoiced ÷ BOQ) ───────────────────────────── */}
      {canSeeBoq && canSeeInv && (
        !completionLoaded ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">📊 Completion vs BOQ</span>
              <span className="text-[11px] text-[#6B7280] dark:text-gray-400">from invoices — not loaded</span>
            </div>
            <button onClick={() => { loadBoq(); loadInvoices() }}
              className="text-[12px] font-semibold text-[#2563FF] border border-[#2563FF]/40 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-3 py-1.5 rounded-lg transition-colors">
              Load matrices
            </button>
          </div>
        ) : boq.length > 0 ? (
          <div className={`grid grid-cols-1 gap-6 ${matrixBuildings.length > 0 ? 'xl:grid-cols-2' : ''}`}>

            {/* Table 1 — completion % by Area */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Completion % × Area</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Area</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Total Contract</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider w-[140px]">Completion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {areaCompletion.map(r => (
                      <tr key={r.label} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2.5 font-medium text-black dark:text-white">{r.label}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#374151] dark:text-gray-300 whitespace-nowrap">{formatCurrency(r.contract, project.currency)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1"><Bar pct={r.pct} color={pColor(r.pct)} height={7} /></div>
                            <span className="text-[11px] font-semibold tabular-nums w-10 text-right" style={{ color: pColor(r.pct) }}>{r.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                      <td className="px-4 py-2.5 font-bold text-black dark:text-white">Project Total</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-black dark:text-white whitespace-nowrap">{formatCurrency(acContract, project.currency)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1"><Bar pct={acPct} color={pColor(acPct)} height={7} /></div>
                          <span className="text-[11px] font-bold tabular-nums w-10 text-right" style={{ color: pColor(acPct) }}>{acPct}%</span>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Table 2 — building × area matrix */}
            {matrixBuildings.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                  <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Stations Completion · Building × Area</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Building</th>
                        {matrixAreas.map(a => (
                          <th key={a} className="px-4 py-2.5 text-center text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{a}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {matrixBuildings.map(b => (
                        <tr key={b} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50">
                          <td className="px-4 py-2.5 font-medium text-black dark:text-white whitespace-nowrap">{b}</td>
                          {matrixAreas.map(a => {
                            const c = cell(b, a)
                            if (!c || c.contract === 0) return <td key={a} className="px-4 py-2.5 text-center text-[#D1D5DB] dark:text-gray-600">—</td>
                            const pct = Math.round(c.invoiced / c.contract * 100)
                            return (
                              <td key={a} className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 min-w-[40px]"><Bar pct={pct} color={pColor(pct)} height={7} /></div>
                                  <span className="text-[11px] font-semibold tabular-nums w-10 text-right" style={{ color: pColor(pct) }}>{pct}%</span>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null
      )}

      {/* ── Project Map — filtered to one Area, with slicer + area stats ──── */}
      {mapAreaOptions.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Project Map</h2>
              <span className="text-[11px] text-[#6B7280] dark:text-gray-400">filtered to one area</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Area slicer — one entry per area (distinct name), not per scope */}
              <label className="text-[11px] font-semibold text-[#6B7280] dark:text-gray-400 hidden sm:block">Area</label>
              <select
                value={activeArea}
                onChange={e => setMapArea(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500 cursor-pointer max-w-[220px]"
              >
                {mapAreaOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button onClick={() => router.push(`/projects/${projectId}/map`)}
                className="text-[11px] text-[#2563FF] hover:underline whitespace-nowrap">Open full map →</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3">
            {/* Map */}
            <div className="relative lg:col-span-2" style={{ height: 380 }}>
              <LeafletMap
                key={activeArea}
                mapped={areaMapped} facilities={areaFacs}
                isDark={isDark} onSelect={() => {}} selected={null} fitNonce={0}
                lineWeight={project?.mapStyle?.lineWeight}
                facilityShape={project?.mapStyle?.facilityShape}
                facilitySize={project?.mapStyle?.facilitySize} />
              {areaMapped.length > 0 && (
                <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 dark:bg-gray-900/95 rounded-lg border border-gray-200 dark:border-gray-700 shadow px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {[...OV_ACTIVITIES.map((a, i) => ({ label: ACTIVITY_KEYS[i].label, color: a.color })),
                      { label: 'Not Started', color: '#9ca3af' }].map(e => (
                      <div key={e.label} className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-1 rounded-full" style={{ background: e.color }} />
                        <span className="text-[10px] text-black dark:text-white">{e.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected-area stats — aggregated across all its scopes */}
            <div className="border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-gray-800 p-5 flex flex-col">
              <div className="flex items-start gap-4 mb-4">
                <RingStat pct={areaPct} size={84} stroke={9} />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Area</div>
                  <div className="text-[14px] font-bold text-black dark:text-white truncate">{activeArea || '—'}</div>
                  <span className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${pctColor(areaPct)}1a`, color: pctColor(areaPct) }}>
                    {areaPct}% complete
                  </span>
                </div>
              </div>

              {/* Scopes contained in this area */}
              {areaScopes.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    {areaScopes.length} scope{areaScopes.length !== 1 ? 's' : ''}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {areaScopes.map(sc => (
                      <span key={sc} className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `${zoneColor(sc)}1a`, color: zoneColor(sc) }}>{sc}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Numbers */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Segments', value: fmtN(areaSegsAll.length) },
                  { label: 'Length',   value: formatLength(areaLen) },
                  { label: 'Done',     value: fmtN(areaSegsAll.filter(s => (s.overallPct || 0) >= 100).length) },
                  { label: 'Not started', value: fmtN(areaSegsAll.filter(s => (s.overallPct || 0) === 0).length) },
                ].map(s => (
                  <div key={s.label} className="bg-[#F9FAFB] dark:bg-gray-800/60 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{s.label}</div>
                    <div className="text-[15px] font-bold text-black dark:text-white">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Per-activity completion across the whole area */}
              {areaSegsAll.length > 0 ? (
                <div className="space-y-2 mt-auto">
                  {areaActStats.map(act => (
                    <div key={act.key}>
                      <div className="flex justify-between items-center text-[11px] mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ background: act.color }} />
                          <span className="text-black dark:text-white">{act.label}</span>
                        </div>
                        <span className="text-[#6B7280] dark:text-gray-400">{act.done}/{areaSegsAll.length} · {act.pct}%</span>
                      </div>
                      <Bar pct={act.pct} color={act.color} height={4} />
                    </div>
                  ))}
                </div>
              ) : areaFacs.length > 0 ? (
                <p className="text-[11px] text-[#6B7280] dark:text-gray-400 mt-auto font-mono">
                  📍 {areaFacs[0].lat.toFixed(6)}, {areaFacs[0].lng.toFixed(6)}
                </p>
              ) : (
                <p className="text-[11px] text-[#6B7280] dark:text-gray-400 mt-auto">No mapped segments in this area.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Two-column section ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Activity Completion */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Activity Completion</h2>
            <button onClick={() => router.push(`/projects/${projectId}/progress`)}
              className="text-[11px] text-[#2563FF] hover:underline">Details →</button>
          </div>
          <div className="px-6 py-5 space-y-4">
            {totalSegs === 0 ? (
              <p className="text-sm text-[#6B7280] dark:text-gray-400 text-center py-4">No segments yet</p>
            ) : (
              actStats.map(act => (
                <div key={act.key}>
                  <div className="flex justify-between items-center text-[12px] mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: act.color }} />
                      <span className="font-medium text-black dark:text-white">{act.label}</span>
                    </div>
                    <span className="text-[#6B7280] dark:text-gray-400 text-[11px]">
                      {act.done}/{totalSegs} · {act.pct}%
                    </span>
                  </div>
                  <Bar pct={act.pct} color={act.color} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Zone Progress by Scope — one table per type (Gravity / Force Main …) */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Progress by Scope</h2>
            <button onClick={() => router.push(`/projects/${projectId}/zones`)}
              className="text-[11px] text-[#2563FF] hover:underline">View all →</button>
          </div>

          {zones.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-[#6B7280] dark:text-gray-400 mb-3">No areas yet</p>
              <button onClick={() => router.push(`/projects/${projectId}/zones`)}
                className="text-sm font-semibold text-black dark:text-white hover:underline">+ Add Area</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {scopeKeys.map(scope => {
                const list   = zonesByType[scope]
                const segSum = list.reduce((s, z) => s + z.segCount, 0)
                const lenSum = list.reduce((s, z) => s + z.totalLen, 0)
                const avg    = list.length
                  ? Math.round(list.reduce((s, z) => s + z.avgPct, 0) / list.length) : 0
                return (
                  <div key={scope} className="px-6 py-4">
                    {/* Scope header */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[12px] font-bold text-black dark:text-white">{scope}</span>
                      <span className="text-[10px] text-[#6B7280] dark:text-gray-400">
                        {list.length} area{list.length !== 1 ? 's' : ''} · {segSum} segs · {formatLength(lenSum)} · {avg}%
                      </span>
                    </div>
                    {/* Per-zone rows for this scope */}
                    <div className="space-y-2.5">
                      {list.map(zone => (
                        <div key={zone.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] text-black dark:text-white">{zone.name}</span>
                            <div className="text-right">
                              <span className="text-[12px] font-bold text-black dark:text-white">{zone.avgPct}%</span>
                              <span className="ml-2 text-[10px] text-[#6B7280] dark:text-gray-400">{zone.segCount} segs</span>
                            </div>
                          </div>
                          <Bar pct={zone.avgPct} color={zone.avgPct >= 80 ? '#22c55e' : zone.avgPct >= 40 ? '#f97316' : '#2563FF'} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Network Length Breakdown ─────────────────────────────────────── */}
      {(project.breakdownEntries?.length || project.gravityLength || project.forcemainLength) ? (() => {
        // Support both new breakdownEntries and legacy fixed fields
        const entries = project.breakdownEntries?.length
          ? project.breakdownEntries
          : [
              ...(project.gravityLength          ? [{ type: 'Gravity',          length: project.gravityLength }]          : []),
              ...(project.forcemainLength        ? [{ type: 'Force Main',        length: project.forcemainLength }]        : []),
              ...(project.houseConnectionsLength ? [{ type: 'House Connections', length: project.houseConnectionsLength }] : []),
            ]
        const total = entries.reduce((s, e) => s + e.length, 0)
        const PALETTE = ['#2563FF','#7C3AED','#22c55e','#f97316','#ef4444','#eab308','#06b6d4']

        return (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Project Breakdown</h2>
              <span className="text-[12px] font-semibold text-[#6B7280] dark:text-gray-400">
                Total: {formatLength(total)}
              </span>
            </div>
            <div className="space-y-4">
              {entries.map((item, i) => {
                const pct = total > 0 ? Math.round((item.length / total) * 100) : 0
                const color = PALETTE[i % PALETTE.length]
                return (
                  <div key={i}>
                    <div className="flex justify-between text-[12px] mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="font-semibold text-black dark:text-white">{item.type}</span>
                      </div>
                      <span className="text-[#6B7280] dark:text-gray-400">{formatLength(item.length)} · {pct}%</span>
                    </div>
                    <Bar pct={pct} color={color} height={8} />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })() : null}

      {/* ── Surface Type + Segment Stats ────────────────────────────────── */}
      {totalSegs > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Surface distribution donut */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-5">Surface Distribution</h2>
            <div className="flex items-center gap-8">
              <DonutChart size={110} data={[
                { label: 'Asphalt', value: asphaltSegs, color: '#111827' },
                { label: 'Dirt',    value: dirtSegs,    color: '#f59e0b' },
              ]} />
              <div className="space-y-3">
                {[
                  { label: 'Asphalt', count: asphaltSegs, color: '#111827' },
                  { label: 'Dirt',    count: dirtSegs,    color: '#f59e0b' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[13px] font-semibold text-black dark:text-white">{s.label}</span>
                    <span className="text-[12px] text-[#6B7280] dark:text-gray-400">
                      {s.count} seg · {totalSegs > 0 ? Math.round(s.count / totalSegs * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Segment quick stats */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-5">Segment Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Segments',   value: fmtN(totalSegs),                   sub: 'across all zones' },
                { label: 'Total Length',     value: formatLength(totalSegLength), sub: 'mapped + unmapped' },
                { label: 'Fully Complete',   value: fmtN(segments.filter(s => (s.overallPct || 0) >= 100).length), sub: 'segments (100%)' },
                { label: 'Not Started',      value: fmtN(segments.filter(s => (s.overallPct || 0) === 0).length), sub: 'segments (0%)' },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
                  <div className="text-xl font-bold text-black dark:text-white">{s.value}</div>
                  <div className="text-[11px] text-[#9CA3AF] dark:text-gray-500">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Navigation ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Areas',    icon: '🗺️', path: `zones`,    desc: `${areaCount} area${areaCount !== 1 ? 's' : ''} · ${zones.length} scope${zones.length !== 1 ? 's' : ''}` },
          { label: 'Segments', icon: '🔧', path: `segments`, desc: `${totalSegs} segments` },
          { label: 'Progress', icon: '📊', path: `progress`, desc: `${projectPct}% overall` },
          { label: 'Back',     icon: '←',  path: null,       desc: 'Portfolio' },
        ].map(nav => (
          <button
            key={nav.label}
            onClick={() => nav.path ? router.push(`/projects/${projectId}/${nav.path}`) : router.push('/dashboard')}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-left hover:border-gray-400 dark:hover:border-gray-600 hover:shadow-sm transition-all group"
          >
            <div className="text-xl mb-2">{nav.icon}</div>
            <div className="text-[13px] font-semibold text-black dark:text-white group-hover:text-[#2563FF] transition-colors">{nav.label}</div>
            <div className="text-[11px] text-[#6B7280] dark:text-gray-400">{nav.desc}</div>
          </button>
        ))}
      </div>

      {editOpen && project && (
        <EditProjectModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSaved={updated => { setProject(updated); setEditOpen(false) }}
        />
      )}
    </div>
  )
}
