'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import {
  Project, ProjectStatus, ProjectType, Currency,
  STATUS_LABELS, STATUS_COLORS, PROJECT_TYPE_LABELS,
  CURRENCIES, PROJECT_TYPES, PROJECT_STATUSES,
  formatCurrency, formatLength, fmtN,
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
  const router = useRouter()
  const [projects,    setProjects]    = useState<Project[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [editProject, setEditProject] = useState<Project | null>(null)

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.get('/api/projects')
      setProjects(data)
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

  const totalValue    = projects.reduce((s, p) => s + (p.contractValue        || 0), 0)
  const totalLength   = projects.reduce((s, p) => s + (p.totalNetworkLength   || 0), 0)
  const active        = projects.filter(p => p.status === 'active').length
  const avgCompletion = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.completionPct || 0), 0) / projects.length)
    : 0

  const kpis = [
    { label: 'Total Projects',       value: fmtN(projects.length),            sub: `${active} active` },
    { label: 'Total Contract Value', value: formatCurrency(totalValue, 'SAR'), sub: 'across portfolio' },
    { label: 'Total Network Length', value: formatLength(totalLength),         sub: 'all projects' },
    { label: 'Avg. Completion',      value: `${avgCompletion}%`,               sub: 'portfolio progress' },
  ]

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Portfolio</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">All active and planned projects</p>
        </div>
        <button
          onClick={() => router.push('/projects/new')}
          className="flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors"
        >
          + New Project
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis.map(k => (
          <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
            <div className="text-[11px] font-semibold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">{k.label}</div>
            <div className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">{k.value}</div>
            <div className="text-[11px] text-[#6B7280] dark:text-gray-500 mt-1">{k.sub}</div>
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
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mb-6">Create your first sewer network project to get started.</p>
          <button onClick={() => router.push('/projects/new')}
            className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
            + New Project
          </button>
        </div>
      )}

      {/* Projects grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(p => {
            const days = p.contractEndDate
              ? Math.ceil((new Date(p.contractEndDate).getTime() - Date.now()) / 86_400_000)
              : null

            return (
              <div key={p.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all flex flex-col">

                <div
                  className="p-6 flex-1 cursor-pointer"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-semibold text-black dark:text-white text-[15px] leading-tight hover:text-[#2563FF] transition-colors">
                      {p.name}
                    </h3>
                    <StatusBadge status={p.status} />
                  </div>

                  <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mb-4">
                    {p.client} · {PROJECT_TYPE_LABELS[p.projectType]}
                  </p>

                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] text-[#6B7280] dark:text-gray-400 mb-1.5">
                      <span>Overall Progress</span>
                      <span className="font-semibold text-black dark:text-white">{p.completionPct || 0}%</span>
                    </div>
                    <ProgressBar pct={p.completionPct || 0} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <div>
                      <div className="text-[10px] text-[#6B7280] dark:text-gray-500 uppercase tracking-wide">Contract Value</div>
                      <div className="text-[13px] font-semibold text-black dark:text-white mt-0.5">
                        {formatCurrency(p.contractValue, p.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#6B7280] dark:text-gray-500 uppercase tracking-wide">Network Length</div>
                      <div className="text-[13px] font-semibold text-black dark:text-white mt-0.5">
                        {formatLength(p.totalNetworkLength || 0)}
                      </div>
                    </div>
                    {days !== null && (
                      <div className="col-span-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <span className={`text-[11px] font-medium ${days < 0 ? 'text-red-500' : days < 30 ? 'text-orange-500' : 'text-[#6B7280] dark:text-gray-400'}`}>
                          {days >= 0 ? `${fmtN(days)} days remaining` : `${fmtN(Math.abs(days))} days overdue`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-2 px-6 py-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => setEditProject(p)}
                    className="text-[12px] font-medium text-[#374151] dark:text-gray-300 hover:text-black dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1.5 rounded-md transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="text-[12px] font-medium text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 px-3 py-1.5 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                  <span className="flex-1" />
                  <button
                    onClick={() => router.push(`/projects/${p.id}`)}
                    className="text-[12px] text-[#2563FF] hover:underline font-medium"
                  >
                    Open →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
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
