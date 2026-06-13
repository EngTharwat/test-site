'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import {
  Project, Permit, ProjectStatus, ProjectType, Currency,
  STATUS_LABELS, STATUS_COLORS, PROJECT_TYPE_LABELS,
  CURRENCIES, PROJECT_TYPES, PROJECT_STATUSES,
  formatCurrency, formatLength, fmtN, daysRemaining,
  permitExpiryState, isHandedOver,
} from '@/lib/types'

// ── tiny components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ProjectStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function ProgressBar({ pct, color = '#2563FF' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

// ── Donut chart (inline SVG, no deps) ───────────────────────────────────────
type Slice = { label: string; value: number; color: string }
function Donut({ data, centerLabel }: { data: Slice[]; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = 40, c = 2 * Math.PI * r
  let off = c / 4
  return (
    <svg width="104" height="104" viewBox="0 0 110 110">
      {total === 0 ? (
        <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeWidth="16" className="text-gray-100 dark:text-gray-800" />
      ) : data.filter(d => d.value > 0).map((d, i) => {
        const dash = (d.value / total) * c
        const el = <circle key={i} cx="55" cy="55" r={r} fill="none" stroke={d.color} strokeWidth="16"
          strokeDasharray={`${dash} ${c}`} strokeDashoffset={off} />
        off -= dash
        return el
      })}
      <circle cx="55" cy="55" r="30" className="fill-white dark:fill-gray-900" />
      <text x="55" y="60" textAnchor="middle" fontSize="16" fontWeight="700" className="fill-black dark:fill-white">
        {centerLabel ?? total}
      </text>
    </svg>
  )
}
function Legend({ data, unit = '' }: { data: Slice[]; unit?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-2 text-[12px]">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
          <span className="text-[#374151] dark:text-gray-300">{d.label}</span>
          <span className="ml-auto font-bold text-black dark:text-white">{d.value}{unit}</span>
        </div>
      ))}
    </div>
  )
}
function Panel({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <h2 className="text-[11px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center justify-between">
        {title}{extra}
      </h2>
      {children}
    </div>
  )
}

/** Pipeline stationing format: 94 700 m → "94+700". */
const chainage = (m: number) =>
  `${Math.floor(m / 1000)}+${String(Math.round(m % 1000)).padStart(3, '0')}`

const pctColor = (pct: number) => pct >= 80 ? '#22c55e' : pct >= 40 ? '#f97316' : '#2563FF'

/** Small radial gauge for average completion. */
function Gauge({ pct, mounted }: { pct: number; mounted: boolean }) {
  const r = 26, c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-gray-200 dark:stroke-white/10" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" stroke={pctColor(pct)} strokeLinecap="round"
          strokeDasharray={`${(mounted ? pct : 0) / 100 * c} ${c}`} transform="rotate(-90 32 32)"
          className="transition-all duration-700 motion-reduce:transition-none" />
        <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-black dark:fill-white">{pct}%</text>
      </svg>
      <div className="text-[10px] uppercase tracking-wider text-[#6B7280] dark:text-gray-400 leading-tight">
        Avg<br />completion
      </div>
    </div>
  )
}

/**
 * Portfolio Pipeline — the whole network as one pipe run.
 * Section width ∝ each project's network length, fill = its completion %,
 * manhole nodes between projects, chainage labels at the ends.
 */
function Pipeline({ projects, mounted, onOpen }: {
  projects: Project[]; mounted: boolean; onOpen: (id: string) => void
}) {
  const runs = projects.filter(p => (p.totalNetworkLength || 0) > 0)
  const total = runs.reduce((s, p) => s + (p.totalNetworkLength || 0), 0)
  if (!runs.length || total <= 0) return null

  // Node markers sit on the hero band, so their fill matches .blueprint-card.
  const node = 'relative z-10 -mx-[5px] w-2.5 h-2.5 rounded-full border-2 border-[#8a95a6] bg-[#F4F8FF] dark:bg-[#1e2737] flex-shrink-0'
  const spacer = 'w-2.5 -mx-[5px] flex-shrink-0'

  return (
    <div>
      {/* Pipe run */}
      <div className="flex items-center">
        {runs.map((p, i) => {
          const pct = Math.min(p.completionPct || 0, 100)
          return (
            <Fragment key={p.id}>
              {i > 0 && <span className={node} />}
              <button
                onClick={() => onOpen(p.id)}
                title={`${p.name} — ${formatLength(p.totalNetworkLength || 0)} · ${pct}%`}
                style={{ flexGrow: p.totalNetworkLength || 1, flexBasis: 0 }}
                className={`relative h-5 min-w-[42px] overflow-hidden bg-gray-300/60 dark:bg-white/10 cursor-pointer hover:opacity-90 transition-opacity
                  ${i === 0 ? 'rounded-s-full' : ''} ${i === runs.length - 1 ? 'rounded-e-full' : ''}`}
              >
                <span
                  className="absolute inset-y-0 start-0 transition-all duration-700 motion-reduce:transition-none"
                  style={{ width: mounted ? `${pct}%` : '0%', background: pctColor(pct) }}
                />
              </button>
            </Fragment>
          )
        })}
      </div>

      {/* Section labels (mirror the pipe widths) */}
      <div className="flex mt-1.5">
        {runs.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && <span className={spacer} />}
            <span
              style={{ flexGrow: p.totalNetworkLength || 1, flexBasis: 0 }}
              className="min-w-[42px] px-1 text-center text-[9px] text-[#6B7280] dark:text-gray-400 truncate"
            >
              {p.name.split('—')[0].split('(')[0].trim()} · {p.completionPct || 0}%
            </span>
          </Fragment>
        ))}
      </div>

      {/* Chainage */}
      <div className="flex justify-between mt-1 font-mono text-[9.5px] text-[#8a95a6]">
        <span>0+000</span>
        <span>{chainage(total)}</span>
      </div>
    </div>
  )
}

const inputCls  = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const selectCls = inputCls + ' cursor-pointer'

// ── Edit Modal ────────────────────────────────────────────────────────────────
type EditForm = {
  name: string; client: string; contractor: string; consultant: string; location: string
  projectType: ProjectType; contractValue: string; currency: Currency
  totalNetworkLength: string; contractStartDate: string; contractEndDate: string
  status: ProjectStatus; description: string
}

function EditModal({
  project, onClose, onSaved,
}: {
  project: Project
  onClose: () => void
  onSaved: (updated: Project) => void
}) {
  const [form, setForm] = useState<EditForm>({
    name:               project.name,
    client:             project.client             || '',
    contractor:         project.contractor         || '',
    consultant:         project.consultant         || '',
    location:           project.location           || '',
    projectType:        project.projectType,
    contractValue:      String(project.contractValue       || 0),
    currency:           project.currency,
    totalNetworkLength: String(project.totalNetworkLength  || 0),
    contractStartDate:  project.contractStartDate  || '',
    contractEndDate:    project.contractEndDate    || '',
    status:             project.status,
    description:        project.description        || '',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const set = (k: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const updated = await api.patch(`/api/projects/${project.id}`, {
        ...form,
        contractValue:      Number(form.contractValue)       || 0,
        totalNetworkLength: Number(form.totalNetworkLength)  || 0,
      })
      onSaved(updated)
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-10 px-4 overflow-y-auto"
         onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-2xl mb-10"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-[15px] font-bold text-black dark:text-white tracking-[-0.3px]">Edit Project</h2>
          <button onClick={onClose} className="text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Project Name *</label>
            <input className={inputCls} required value={form.name} onChange={set('name')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Client</label>
              <input className={inputCls} value={form.client} onChange={set('client')} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Contractor</label>
              <input className={inputCls} value={form.contractor} onChange={set('contractor')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Consultant</label>
              <input className={inputCls} value={form.consultant} onChange={set('consultant')} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Location</label>
              <input className={inputCls} value={form.location} onChange={set('location')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Project Type</label>
              <select className={selectCls} value={form.projectType} onChange={set('projectType')}>
                {PROJECT_TYPES.map(t => <option key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Status</label>
              <select className={selectCls} value={form.status} onChange={set('status')}>
                {PROJECT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Contract Value</label>
              <input className={inputCls} type="number" min="0" step="any" value={form.contractValue} onChange={set('contractValue')} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Currency</label>
              <select className={selectCls} value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Total Project Length (m)</label>
              <input className={inputCls} type="number" min="0" step="1" value={form.totalNetworkLength} onChange={set('totalNetworkLength')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Contract Start Date</label>
              <input className={inputCls} type="date" value={form.contractStartDate} onChange={set('contractStartDate')} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Contract End Date</label>
              <input className={inputCls} type="date" value={form.contractEndDate} onChange={set('contractEndDate')} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Description</label>
            <textarea className={inputCls + ' resize-none'} rows={3} value={form.description} onChange={set('description')} />
          </div>
          {err && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-4 py-2 rounded-lg">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PortfolioDashboard() {
  const router    = useRouter()
  const { profile } = useAuth()
  const isAdmin   = profile?.isAdmin ?? false

  const [projects,    setProjects]    = useState<Project[]>([])
  const [permits,     setPermits]     = useState<Permit[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [editProject, setEditProject] = useState<Project | null>(null)

  // Flips one frame after data arrives — drives the single load animation
  // (pipeline fill, gauge arc, value bars grow together).
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!loading) requestAnimationFrame(() => setMounted(true))
  }, [loading])

  const fetchProjects = useCallback(async () => {
    try {
      const data: Project[] = await api.get('/api/projects')
      setProjects(data)
      // Aggregate permits across all projects (best-effort; ignore ones we can't read)
      Promise.all(data.map(p =>
        api.get(`/api/projects/${p.id}/permits`).catch(() => [] as Permit[])
      )).then(lists => setPermits(lists.flat()))
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  async function handleDelete(projectId: string, name: string) {
    if (!confirm(`Delete "${name}"?\n\nAll zones, segments, and cash flow data will be permanently removed.`)) return
    try {
      await api.delete(`/api/projects/${projectId}`)
      setProjects(prev => prev.filter(p => p.id !== projectId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
    }
  }

  // ── Aggregates ──────────────────────────────────────────────────────────
  const totalValue    = projects.reduce((s, p) => s + (p.contractValue      || 0), 0)
  const totalLength   = projects.reduce((s, p) => s + (p.totalNetworkLength || 0), 0)
  const execLength    = projects.reduce((s, p) => s + (p.totalNetworkLength || 0) * (p.completionPct || 0) / 100, 0)
  const active        = projects.filter(p => p.status === 'active').length
  const avgCompletion = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.completionPct || 0), 0) / projects.length)
    : 0
  const currency = (projects[0]?.currency ?? 'SAR') as Currency

  // Permit buckets (handed-over counts on its own, excluded from expiry)
  const permitState = (p: Permit) => isHandedOver(p.excavation) ? 'handed_over' : permitExpiryState(p.expiryDate)
  const pExpiring   = permits.filter(p => permitState(p) === 'soon').length
  const pExpired    = permits.filter(p => permitState(p) === 'expired').length
  const pHanded     = permits.filter(p => permitState(p) === 'handed_over').length
  const pActive     = permits.filter(p => permitState(p) === 'valid').length

  // Quiet stat band under the hero (hero owns executed km + avg completion)
  const stats = [
    { label: 'Projects', value: fmtN(projects.length), sub: `${active} active` },
    { label: 'Contract value',
      value: totalValue >= 1e6 ? `${currency} ${(totalValue / 1e6).toFixed(1)}M` : formatCurrency(totalValue, currency),
      sub: 'across portfolio' },
    { label: 'Project length', value: formatLength(totalLength), sub: 'design length' },
    { label: 'Permits expiring', value: fmtN(pExpiring),
      sub: pExpired > 0 ? `${pExpired} expired` : '≤30 days',
      accent: pExpiring ? '#f97316' : undefined,
      subAccent: pExpired > 0 ? '#ef4444' : undefined },
  ]

  // Contract deadlines, soonest first; completed projects sink to the bottom
  const deadlines = projects
    .filter(p => p.contractEndDate)
    .map(p => ({ p, days: daysRemaining(p.contractEndDate) }))
    .sort((a, b) =>
      (a.p.status === 'completed' ? 1 : 0) - (b.p.status === 'completed' ? 1 : 0) || a.days - b.days)

  // Status donut
  const statusSlices: Slice[] = (['active','planning','completed','on_hold','cancelled'] as ProjectStatus[])
    .map(s => ({ label: STATUS_LABELS[s], value: projects.filter(p => p.status === s).length, color: STATUS_COLORS[s].dot }))
    .filter(s => s.value > 0)

  // Network composition by type (metres, drawn as a stacked run)
  const TPAL = ['#2563FF','#06b6d4','#7C3AED','#22c55e','#f97316']
  const typeMap: Record<string, number> = {}
  projects.forEach(p => { typeMap[p.projectType] = (typeMap[p.projectType] || 0) + (p.totalNetworkLength || 0) })
  const typeSegs = Object.entries(typeMap)
    .map(([t, m], i) => ({ label: PROJECT_TYPE_LABELS[t as ProjectType] ?? t, m, color: TPAL[i % TPAL.length] }))
    .filter(s => s.m > 0)

  // Permit donut
  const permitSlices: Slice[] = [
    { label: 'Active',        value: pActive,   color: '#22c55e' },
    { label: 'Expiring ≤30d', value: pExpiring, color: '#f97316' },
    { label: 'Expired',       value: pExpired,  color: '#ef4444' },
    { label: 'Handed Over',   value: pHanded,   color: '#06b6d4' },
  ].filter(s => s.value > 0)

  const maxValue = Math.max(...projects.map(p => p.contractValue || 0), 1)

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Portfolio</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">All active and planned projects</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => router.push('/projects/new')}
            className="flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors"
          >
            + New Project
          </button>
        )}
      </div>

      {/* Hero — blueprint band with the portfolio pipeline */}
      {!loading && projects.length > 0 && (
        <>
          <div className="blueprint-card rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[2px] text-[#6B7280] dark:text-gray-400 mb-1.5">
                  Project execution
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[34px] leading-none font-bold tracking-[-1px] text-black dark:text-white tabular-nums">
                    {formatLength(execLength)}
                  </span>
                  <span className="text-[13px] text-[#6B7280] dark:text-gray-400">
                    executed of {formatLength(totalLength)}
                  </span>
                </div>
              </div>
              <Gauge pct={avgCompletion} mounted={mounted} />
            </div>
            <Pipeline projects={projects} mounted={mounted} onOpen={id => router.push(`/projects/${id}`)} />
          </div>

          {/* Stat band — one card, hairline dividers */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 grid grid-cols-2 lg:grid-cols-4 mb-4">
            {stats.map((s, i) => (
              <div key={s.label}
                className={`p-4 border-gray-100 dark:border-gray-800
                  ${i % 2 === 1 ? 'border-s' : ''} ${i >= 2 ? 'max-lg:border-t' : ''} ${i > 0 ? 'lg:border-s' : ''}`}>
                <div className="text-[9.5px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{s.label}</div>
                <div className="text-[20px] font-bold tracking-[-0.5px] dark:text-white mt-1.5 leading-none tabular-nums"
                  style={{ color: (s as any).accent }}>{s.value}</div>
                <div className="text-[11px] text-[#6B7280] dark:text-gray-500 mt-1.5"
                  style={{ color: (s as any).subAccent }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Error */}
      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 px-4 py-2 rounded-lg mb-6">{error}</p>}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="h-40 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="h-[88px] rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-44 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          {/* Ascending bars — the logo's own motif */}
          <svg width="40" height="28" viewBox="0 0 40 28" className="mx-auto mb-4 text-gray-300 dark:text-gray-600">
            <rect x="4"  y="14" width="6" height="12" rx="2" fill="currentColor" />
            <rect x="17" y="8"  width="6" height="18" rx="2" fill="currentColor" />
            <rect x="30" y="2"  width="6" height="24" rx="2" fill="currentColor" />
          </svg>
          <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No projects yet</h3>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mb-6">
            {isAdmin ? 'Create your first sewer network project to get started.' : 'No projects are available to you yet.'}
          </p>
          {isAdmin && (
            <button onClick={() => router.push('/projects/new')}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
              + New Project
            </button>
          )}
        </div>
      )}

      {/* Charts + table */}
      {!loading && projects.length > 0 && (
        <>
          {/* Donut row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Panel title="Projects by Status">
              <div className="flex items-center gap-5">
                <Donut data={statusSlices} centerLabel={String(projects.length)} />
                <div className="flex-1"><Legend data={statusSlices} /></div>
              </div>
            </Panel>
            <Panel title="Length by Type"
              extra={<span className="text-[10px] font-normal normal-case text-[#9CA3AF] tabular-nums">{(totalLength / 1000).toFixed(1)} km</span>}>
              {typeSegs.length === 0 ? (
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 py-6 text-center">No network lengths set</p>
              ) : (
                <>
                  <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 mb-4">
                    {typeSegs.map(s => (
                      <span key={s.label} className="h-full"
                        style={{ width: `${s.m / totalLength * 100}%`, minWidth: 6, background: s.color }} />
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    {typeSegs.map(s => (
                      <div key={s.label} className="flex items-center gap-2 text-[12px]">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                        <span className="text-[#374151] dark:text-gray-300">{s.label}</span>
                        <span className="ml-auto font-bold text-black dark:text-white tabular-nums">{(s.m / 1000).toFixed(1)} km</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel>
            <Panel title="Permits" extra={permits.length > 0
              ? <span className="text-[10px] font-normal normal-case text-[#9CA3AF]">{permits.length} total</span> : undefined}>
              {permitSlices.length === 0 ? (
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 py-6 text-center">No permits yet</p>
              ) : (
                <div className="flex items-center gap-5">
                  <Donut data={permitSlices} centerLabel={String(permits.length)} />
                  <div className="flex-1"><Legend data={permitSlices} /></div>
                </div>
              )}
            </Panel>
          </div>

          {/* Completion + value bars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Contract Deadlines">
              {deadlines.length === 0 ? (
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 py-6 text-center">No contract end dates set</p>
              ) : (
                <div className="space-y-3">
                  {deadlines.map(({ p, days }) => {
                    const chip = p.status === 'completed'
                      ? { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', txt: 'Completed' }
                      : days < 0
                      ? { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', txt: `${fmtN(-days)} d overdue` }
                      : days < 30
                      ? { cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', txt: `${fmtN(days)} d left` }
                      : { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', txt: `${fmtN(days)} d left` }
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="flex-1 text-[12px] text-black dark:text-white truncate cursor-pointer hover:text-[#2563FF]"
                          onClick={() => router.push(`/projects/${p.id}`)} title={p.name}>{p.name}</span>
                        <span className="font-mono text-[10px] text-[#8a95a6] whitespace-nowrap">{p.contractEndDate}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>{chip.txt}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
            <Panel title="Contract Value" extra={<span className="text-[10px] font-normal normal-case text-[#9CA3AF]">{currency} millions</span>}>
              <div className="flex items-end gap-3 h-[170px] pt-2">
                {projects.map(p => (
                  <div key={p.id} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                    <span className="text-[10px] font-bold text-black dark:text-white tabular-nums">{((p.contractValue||0)/1e6).toFixed(1)}</span>
                    <div className="w-full max-w-[44px] rounded-t-lg transition-all duration-700 motion-reduce:transition-none"
                      style={{ height: mounted ? `${Math.round((p.contractValue||0)/maxValue*100)}%` : '0%', minHeight: 4, background: STATUS_COLORS[p.status].dot }} />
                    <span className="text-[9px] text-[#9CA3AF] text-center leading-tight">{p.name.split('—')[0].split('(')[0].trim().slice(0,14)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Projects table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  {['Project','Client','Type','Status','Value','Length','Progress',''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {projects.map(p => {
                  const pct = p.completionPct || 0
                  const col = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f97316' : '#2563FF'
                  return (
                    <tr key={p.id} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-black dark:text-white max-w-[240px] truncate cursor-pointer hover:text-[#2563FF]"
                        onClick={() => router.push(`/projects/${p.id}`)} title={p.name}>{p.name}</td>
                      <td className="px-4 py-3 text-[#6B7280] dark:text-gray-400 whitespace-nowrap">{p.client || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7280] dark:text-gray-400 whitespace-nowrap">{PROJECT_TYPE_LABELS[p.projectType]}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatCurrency(p.contractValue, p.currency)}</td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatLength(p.totalNetworkLength || 0)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20"><ProgressBar pct={pct} color={col} /></div>
                          <span className="font-bold text-black dark:text-white">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 justify-end whitespace-nowrap">
                          {isAdmin && (
                            <>
                              <button onClick={() => setEditProject(p)} className="text-[11px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white">Edit</button>
                              <button onClick={() => handleDelete(p.id, p.name)} className="text-[11px] text-red-400 hover:text-red-600">Delete</button>
                            </>
                          )}
                          <button onClick={() => router.push(`/projects/${p.id}`)} className="text-[11px] text-[#2563FF] hover:underline font-medium">Open →</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editProject && (
        <EditModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onSaved={updated => {
            setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
            setEditProject(null)
          }}
        />
      )}
    </div>
  )
}
