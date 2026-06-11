'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import {
  Project, Permit, ProjectStatus, ProjectType, Currency,
  STATUS_LABELS, STATUS_COLORS, PROJECT_TYPE_LABELS,
  CURRENCIES, PROJECT_TYPES, PROJECT_STATUSES,
  formatCurrency, formatLength, fmtN,
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
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Total Network Length (m)</label>
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

  const kpis = [
    { label: 'Total Projects', icon: '📋', value: fmtN(projects.length),                 sub: `${active} active` },
    { label: 'Contract Value', icon: '💰', value: formatCurrency(totalValue, currency),  sub: 'across portfolio' },
    { label: 'Network Length', icon: '📏', value: formatLength(totalLength),             sub: 'design length' },
    { label: 'Executed',       icon: '🚧', value: formatLength(execLength),
      sub: totalLength > 0 ? `${Math.round(execLength / totalLength * 100)}% of network` : '—' },
    { label: 'Avg. Completion',icon: '📊', value: `${avgCompletion}%`, sub: 'portfolio progress',
      accent: avgCompletion >= 80 ? '#22c55e' : avgCompletion >= 40 ? '#f97316' : '#2563FF' },
    { label: 'Permits Expiring',icon: '⚠️', value: fmtN(pExpiring), sub: '≤30 days · review',
      accent: pExpiring ? '#f97316' : undefined },
  ]

  // Status donut
  const statusSlices: Slice[] = (['active','planning','completed','on_hold','cancelled'] as ProjectStatus[])
    .map(s => ({ label: STATUS_LABELS[s], value: projects.filter(p => p.status === s).length, color: STATUS_COLORS[s].dot }))
    .filter(s => s.value > 0)

  // Network by type (km, rounded)
  const TPAL = ['#2563FF','#06b6d4','#7C3AED','#22c55e','#f97316']
  const typeMap: Record<string, number> = {}
  projects.forEach(p => { typeMap[p.projectType] = (typeMap[p.projectType] || 0) + (p.totalNetworkLength || 0) })
  const typeSlices: Slice[] = Object.entries(typeMap)
    .map(([t, m], i) => ({ label: PROJECT_TYPE_LABELS[t as ProjectType] ?? t, value: Math.round(m / 1000), color: TPAL[i % TPAL.length] }))
    .filter(s => s.value > 0)

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

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {kpis.map(k => (
          <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="text-[9.5px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{k.label}</div>
              <span className="text-base leading-none">{k.icon}</span>
            </div>
            <div className="text-[22px] font-bold tracking-[-0.5px] dark:text-white mt-2 leading-none" style={{ color: (k as any).accent }}>{k.value}</div>
            <div className="text-[11px] text-[#6B7280] dark:text-gray-500 mt-2">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 px-4 py-2 rounded-lg mb-6">{error}</p>}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 mb-6" />
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded mb-4" />
              <div className="flex gap-4">
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-4xl mb-4">📋</div>
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
            <Panel title="Network by Type">
              <div className="flex items-center gap-5">
                <Donut data={typeSlices} centerLabel={`${Math.round(totalLength/1000)}`} />
                <div className="flex-1"><Legend data={typeSlices} unit=" km" /></div>
              </div>
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
            <Panel title="Completion by Project">
              <div className="space-y-3">
                {projects.map(p => {
                  const pct = p.completionPct || 0
                  const col = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f97316' : '#2563FF'
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between text-[12px] mb-1.5">
                        <span className="text-black dark:text-white truncate max-w-[75%]">{p.name}</span>
                        <span className="font-bold text-[#6B7280] dark:text-gray-400">{pct}%</span>
                      </div>
                      <ProgressBar pct={pct} color={col} />
                    </div>
                  )
                })}
              </div>
            </Panel>
            <Panel title="Contract Value" extra={<span className="text-[10px] font-normal normal-case text-[#9CA3AF]">{currency} millions</span>}>
              <div className="flex items-end gap-3 h-[170px] pt-2">
                {projects.map(p => (
                  <div key={p.id} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                    <span className="text-[10px] font-bold text-black dark:text-white">{((p.contractValue||0)/1e6).toFixed(1)}</span>
                    <div className="w-full max-w-[44px] rounded-t-lg" style={{ height: `${Math.round((p.contractValue||0)/maxValue*100)}%`, minHeight: 4, background: STATUS_COLORS[p.status].dot }} />
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
                      <td className="px-4 py-3 whitespace-nowrap">{formatCurrency(p.contractValue, p.currency)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatLength(p.totalNetworkLength || 0)}</td>
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
