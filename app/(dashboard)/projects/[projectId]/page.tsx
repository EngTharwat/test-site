'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import {
  Project, Zone, CashFlowRecord, CashFlowWithComputed,
  ProjectStatus, ProjectType, Currency,
  STATUS_LABELS, STATUS_COLORS, PROJECT_TYPE_LABELS,
  ACTIVITY_KEYS, formatCurrency, formatLength, daysRemaining, fmtN,
  MONTH_NAMES, CURRENCIES, PROJECT_TYPES, PROJECT_STATUSES,
} from '@/lib/types'

// ── Shared small components ───────────────────────────────────────────────────
function StatusBadge({ status }: { status: Project['status'] }) {
  const c = STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
      <div className="text-[10px] font-semibold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tracking-[-0.5px] dark:text-white" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#6B7280] dark:text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function ProgressBar({ pct, color = '#2563FF', height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div className="bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

// ── inputCls ──────────────────────────────────────────────────────────────────
const inputCls  = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const selectCls = inputCls + ' cursor-pointer'

// ── Edit Project Modal ────────────────────────────────────────────────────────
type EditForm = {
  name: string; client: string; contractor: string; consultant: string; location: string
  projectType: ProjectType; contractValue: string; currency: Currency
  totalNetworkLength: string; contractStartDate: string; contractEndDate: string
  status: ProjectStatus; description: string
}

function EditProjectModal({
  project, onClose, onSaved,
}: {
  project: Project; onClose: () => void; onSaved: (updated: Project) => void
}) {
  const [form, setForm] = useState<EditForm>({
    name:               project.name,
    client:             project.client             || '',
    contractor:         project.contractor         || '',
    consultant:         project.consultant         || '',
    location:           project.location           || '',
    projectType:        project.projectType,
    contractValue:      String(project.contractValue      || 0),
    currency:           project.currency,
    totalNetworkLength: String(project.totalNetworkLength || 0),
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
        contractValue:      Number(form.contractValue)      || 0,
        totalNetworkLength: Number(form.totalNetworkLength) || 0,
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
export default function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()

  const isAdmin  = profile?.isAdmin ?? false
  const pagePerm = (!isAdmin && profile?.permissions)
    ? getProjectPagePermissions(profile.permissions, projectId)
    : null
  const canEdit  = isAdmin || pagePerm?.overview === 'edit'
  const canSeeZones = isAdmin || (pagePerm && pagePerm.zones !== 'none')

  const [project,  setProject]  = useState<Project | null>(null)
  const [zones,    setZones]    = useState<Zone[]>([])
  const [cashflow, setCashflow] = useState<CashFlowWithComputed[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [proj, zoneData, cfData] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/projects/${projectId}/zones`),
        api.get(`/api/projects/${projectId}/cashflow`),
      ])
      setProject(proj)
      setZones(zoneData)
      let cumP = 0, cumA = 0
      const withCumulative: CashFlowWithComputed[] = (cfData as CashFlowRecord[])
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
        .map(r => {
          cumP += r.planned; cumA += r.actual
          return { ...r, variance: r.actual - r.planned, cumulativePlanned: cumP, cumulativeActual: cumA }
        })
      setCashflow(withCumulative)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleDelete() {
    if (!project) return
    if (!confirm(`Delete "${project.name}"?\n\nAll data will be permanently removed.`)) return
    setDeleting(true)
    try {
      await api.delete(`/api/projects/${projectId}`)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="p-8 space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}
    </div>
  )

  if (error || !project) return (
    <div className="p-8">
      <p className="text-red-500">{error || 'Project not found'}</p>
    </div>
  )

  const days      = project.contractEndDate ? daysRemaining(project.contractEndDate) : null
  const totalCFPlan = cashflow.reduce((s, r) => s + r.planned, 0)
  const totalCFAct  = cashflow.reduce((s, r) => s + r.actual, 0)

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* Project header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-black dark:text-white tracking-[-0.4px]">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#6B7280] dark:text-gray-400">
              {project.client     && <span>👤 {project.client}</span>}
              {project.contractor && <span>🏗 {project.contractor}</span>}
              {project.location   && <span>📍 {project.location}</span>}
              <span>🏷 {PROJECT_TYPE_LABELS[project.projectType]}</span>
            </div>
            {project.contractStartDate && project.contractEndDate && (
              <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-2">
                {project.contractStartDate} → {project.contractEndDate}
                {days !== null && (
                  <span className={`ml-2 font-semibold ${days < 0 ? 'text-red-500' : days < 30 ? 'text-orange-500' : 'text-[#6B7280] dark:text-gray-400'}`}>
                    ({days >= 0 ? `${fmtN(days)} days left` : `${fmtN(Math.abs(days))} days overdue`})
                  </span>
                )}
              </p>
            )}
            {project.description && <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-2">{project.description}</p>}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && (
              <>
                <button onClick={() => setEditOpen(true)}
                  className="text-sm font-semibold text-[#374151] dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors">
                  Edit
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="text-sm font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors">
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
            {canSeeZones && (
              <button onClick={() => router.push(`/projects/${projectId}/zones`)}
                className="text-sm font-semibold text-white bg-black dark:bg-white dark:text-black hover:bg-[#0F1115] dark:hover:bg-gray-100 px-4 py-2 rounded-lg transition-colors">
                Manage Zones →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Contract Value"   value={formatCurrency(project.contractValue, project.currency)} sub={project.currency} />
        <KpiCard label="Network Length"   value={formatLength(project.totalNetworkLength)} sub={`Executed: ${formatLength(project.executedLength || 0)}`} />
        <KpiCard label="Overall Progress" value={`${project.completionPct || 0}%`} sub={`${fmtN(zones.length)} zones`}
          accent={project.completionPct >= 80 ? '#22c55e' : project.completionPct >= 40 ? '#f97316' : '#2563FF'} />
        <KpiCard label="Cash Flow Actual" value={formatCurrency(totalCFAct, project.currency)} sub={`Planned: ${formatCurrency(totalCFPlan, project.currency)}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Zone Progress */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Zone Progress</h2>
            <button onClick={() => router.push(`/projects/${projectId}/zones`)} className="text-[11px] text-[#2563FF] hover:underline">
              View all →
            </button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {zones.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-[#6B7280] dark:text-gray-400 mb-3">No zones yet</p>
                <button onClick={() => router.push(`/projects/${projectId}/zones`)}
                  className="text-sm font-semibold text-black dark:text-white hover:underline">
                  + Add Zone
                </button>
              </div>
            ) : (
              zones.slice(0, 6).map(zone => (
                <div key={zone.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-medium text-black dark:text-white">{zone.name}</span>
                    <span className="text-[12px] font-bold text-black dark:text-white">{zone.completionPct || 0}%</span>
                  </div>
                  <ProgressBar pct={zone.completionPct || 0} />
                  <div className="flex gap-4 mt-1.5">
                    <span className="text-[10px] text-[#6B7280] dark:text-gray-400">{formatLength(zone.executedLength || 0)} executed</span>
                    <span className="text-[10px] text-[#6B7280] dark:text-gray-400">{formatLength(zone.totalLength || 0)} total</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity Summary */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Activity Breakdown</h2>
            <button onClick={() => router.push(`/projects/${projectId}/progress`)} className="text-[11px] text-[#2563FF] hover:underline">
              Details →
            </button>
          </div>
          <div className="px-6 py-4 space-y-4">
            {zones.length === 0 ? (
              <p className="text-sm text-[#6B7280] dark:text-gray-400 text-center py-4">Add zones and segments to see activity breakdown</p>
            ) : (
              ACTIVITY_KEYS.map(act => {
                const pct = project.completionPct || 0
                return (
                  <div key={act.key}>
                    <div className="flex justify-between text-[12px] mb-1.5">
                      <span className="font-medium text-black dark:text-white">{act.label}</span>
                      <span className="text-[#6B7280] dark:text-gray-400">{pct}%</span>
                    </div>
                    <ProgressBar pct={pct} color={act.color} />
                  </div>
                )
              })
            )}
          </div>

          {/* Cash flow mini view */}
          {cashflow.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 px-6 py-4">
              <div className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-3">Cash Flow (Last 3 Months)</div>
              <div className="space-y-2">
                {cashflow.slice(-3).map(r => {
                  const monthLabel = `${MONTH_NAMES[r.month - 1]} ${r.year}`
                  const varPct = r.planned > 0 ? ((r.actual - r.planned) / r.planned * 100).toFixed(1) : '0'
                  const isNeg = r.actual < r.planned
                  return (
                    <div key={r.id} className="flex items-center justify-between text-[12px]">
                      <span className="text-[#6B7280] dark:text-gray-400 w-20">{monthLabel}</span>
                      <div className="flex-1 mx-3">
                        <ProgressBar pct={r.planned > 0 ? (r.actual / r.planned) * 100 : 0} color={isNeg ? '#f97316' : '#22c55e'} height={4} />
                      </div>
                      <span className={`font-semibold w-16 text-right ${isNeg ? 'text-orange-500' : 'text-green-500'}`}>
                        {isNeg ? '' : '+'}{varPct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
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
