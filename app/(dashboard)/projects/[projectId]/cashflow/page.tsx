'use client'

import { useState, useEffect, useCallback, useRef, use, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import {
  Project, CashFlowRecord, CashFlowWithComputed,
  MONTH_NAMES, formatCurrency, fmtN, Currency,
} from '@/lib/types'
import { UploadProgressModal, type UploadState, initialUpload } from '@/lib/upload-progress'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

// ── Cumulative computation ────────────────────────────────────────────────────
function computeCF(records: CashFlowRecord[]): CashFlowWithComputed[] {
  const sorted = [...records].sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  let cumP = 0, cumA = 0
  return sorted.map(r => {
    cumP += r.planned
    cumA += r.actual
    return { ...r, variance: r.actual - r.planned, cumulativePlanned: cumP, cumulativeActual: cumA }
  })
}

// ── XER (Primavera P6) parsing ───────────────────────────────────────────────
// XER is tab-delimited: %T table, %F field names, %R row values.
type XerTables = Record<string, Record<string, string>[]>

function parseXer(text: string): XerTables {
  const tables: XerTables = {}
  let current = ''
  let fields: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split('\t')
    switch (parts[0]) {
      case '%T': current = parts[1]?.trim() ?? ''; tables[current] = []; fields = []; break
      case '%F': fields = parts.slice(1).map(f => f.trim()); break
      case '%R': {
        if (!current || !fields.length) break
        const row: Record<string, string> = {}
        fields.forEach((f, i) => { row[f] = parts[i + 1] ?? '' })
        tables[current].push(row)
        break
      }
    }
  }
  return tables
}

/** "2024-05-23 08:00" → Date (date part only). */
function xerDate(s: string | undefined): Date | null {
  if (!s) return null
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Linearly spread a cost across [start, end] into monthly buckets by day overlap. */
function spreadCost(
  buckets: Map<string, { planned: number; actual: number }>,
  field: 'planned' | 'actual',
  start: Date | null, end: Date | null, cost: number,
) {
  if (!start || cost <= 0) return
  const e = end && end.getTime() >= start.getTime() ? end : start
  const DAY = 86_400_000
  const totalDays = Math.max(1, Math.round((e.getTime() - start.getTime()) / DAY) + 1)
  let cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur.getTime() <= e.getTime()) {
    const mStart = new Date(cur.getFullYear(), cur.getMonth(), 1)
    const mEnd   = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    const oStart = start > mStart ? start : mStart
    const oEnd   = e < mEnd ? e : mEnd
    const days   = Math.max(0, Math.round((oEnd.getTime() - oStart.getTime()) / DAY) + 1)
    if (days > 0) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      const b = buckets.get(key) ?? { planned: 0, actual: 0 }
      b[field] += cost * days / totalDays
      buckets.set(key, b)
    }
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
}

interface XerResult {
  projectName: string
  taskCount:   number
  costedTasks: number
  months:      { year: number; month: number; monthKey: string; planned: number; actual: number }[]
  totalPlanned: number
  totalActual:  number
}

/** Build a monthly cash-flow distribution from an XER's TASK + TASKRSRC (+ PROJCOST). */
function xerToCashflow(tables: XerTables): XerResult {
  const tasks = tables.TASK ?? []
  const num = (v: string | undefined) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : 0 }

  // Cost per task: resource assignments + expenses
  const plannedByTask = new Map<string, number>()
  const actualByTask  = new Map<string, number>()
  for (const r of tables.TASKRSRC ?? []) {
    const id = r.task_id
    if (!id) continue
    plannedByTask.set(id, (plannedByTask.get(id) ?? 0) + num(r.target_cost))
    actualByTask.set(id,  (actualByTask.get(id)  ?? 0) + num(r.act_reg_cost) + num(r.act_ot_cost))
  }
  for (const r of tables.PROJCOST ?? []) {
    const id = r.task_id
    if (!id) continue
    plannedByTask.set(id, (plannedByTask.get(id) ?? 0) + num(r.target_cost))
    actualByTask.set(id,  (actualByTask.get(id)  ?? 0) + num(r.act_cost))
  }

  const buckets = new Map<string, { planned: number; actual: number }>()
  let costedTasks = 0
  for (const t of tasks) {
    const planned = plannedByTask.get(t.task_id) ?? 0
    const actual  = actualByTask.get(t.task_id)  ?? 0
    if (planned <= 0 && actual <= 0) continue
    costedTasks++
    // Planned spend over the planned (target) dates
    spreadCost(buckets, 'planned', xerDate(t.target_start_date), xerDate(t.target_end_date), planned)
    // Actual spend over actual dates (in-progress tasks: through act_start month)
    spreadCost(buckets, 'actual', xerDate(t.act_start_date), xerDate(t.act_end_date), actual)
  }

  const months = [...buckets.entries()]
    .map(([monthKey, v]) => ({
      monthKey,
      year:  Number(monthKey.slice(0, 4)),
      month: Number(monthKey.slice(5, 7)),
      planned: Math.round(v.planned * 100) / 100,
      actual:  Math.round(v.actual  * 100) / 100,
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  return {
    projectName: tables.PROJECT?.[0]?.proj_short_name ?? '',
    taskCount:   tasks.length,
    costedTasks,
    months,
    totalPlanned: months.reduce((s, m) => s + m.planned, 0),
    totalActual:  months.reduce((s, m) => s + m.actual, 0),
  }
}

// ── Cash-flow histogram (SVG): monthly bars + cumulative S-curves ───────────
function Histogram({ records, currency, mounted }: {
  records: CashFlowWithComputed[]; currency: Currency; mounted: boolean
}) {
  if (records.length === 0) return null
  const SLOT = 38, PAD = 14, H = 170, LBL = 30
  const width  = PAD * 2 + records.length * SLOT
  const maxBar = Math.max(...records.map(r => Math.max(r.planned, r.actual)), 1)
  const maxCum = Math.max(records[records.length - 1].cumulativePlanned, records[records.length - 1].cumulativeActual, 1)

  const x = (i: number) => PAD + i * SLOT + SLOT / 2
  const cumY = (v: number) => H - (v / maxCum) * (H - 10)
  const lineP = records.map((r, i) => `${x(i)},${cumY(r.cumulativePlanned)}`).join(' ')
  const lineA = records.filter(r => r.actual > 0 || r.cumulativeActual > 0)
  const lineAPts = records.map((r, i) => `${x(i)},${cumY(r.cumulativeActual)}`).join(' ')

  return (
    <div className="overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${width} ${H + LBL}`} style={{ minWidth: Math.min(width, 900) }}>
        {/* Hairline grid */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD} x2={width - PAD} y1={H - f * (H - 10)} y2={H - f * (H - 10)}
            className="stroke-gray-100 dark:stroke-white/5" strokeWidth="1" />
        ))}

        {/* Monthly bars */}
        {records.map((r, i) => {
          const hP = (r.planned / maxBar) * (H - 10)
          const hA = (r.actual  / maxBar) * (H - 10)
          return (
            <Fragment key={r.id ?? r.monthKey}>
              <rect x={x(i) - 13} width="12" rx="2"
                y={mounted ? H - hP : H} height={mounted ? hP : 0}
                fill="#2563FF" fillOpacity="0.85"
                className="transition-all duration-700 motion-reduce:transition-none">
                <title>{`${MONTH_NAMES[r.month - 1]} ${r.year} — planned ${formatCurrency(r.planned, currency)}`}</title>
              </rect>
              <rect x={x(i) + 1} width="12" rx="2"
                y={mounted ? H - hA : H} height={mounted ? hA : 0}
                fill="#22c55e" fillOpacity="0.85"
                className="transition-all duration-700 motion-reduce:transition-none">
                <title>{`${MONTH_NAMES[r.month - 1]} ${r.year} — actual ${formatCurrency(r.actual, currency)}`}</title>
              </rect>
              {/* Month label */}
              <text x={x(i)} y={H + 13} textAnchor="middle" fontSize="8.5"
                className="fill-gray-400 dark:fill-gray-500">{MONTH_NAMES[r.month - 1].slice(0, 3)}</text>
              <text x={x(i)} y={H + 24} textAnchor="middle" fontSize="8.5"
                className="fill-gray-300 dark:fill-gray-600">{String(r.year).slice(2)}</text>
            </Fragment>
          )
        })}

        {/* Cumulative S-curves */}
        <polyline points={lineP} fill="none" stroke="#2563FF" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
          style={{ opacity: mounted ? 1 : 0, transition: 'opacity .7s' }} />
        {lineA.length > 0 && (
          <polyline points={lineAPts} fill="none" stroke="#22c55e" strokeWidth="2"
            strokeDasharray="5 3" strokeLinejoin="round" strokeLinecap="round"
            style={{ opacity: mounted ? 1 : 0, transition: 'opacity .7s' }} />
        )}
      </svg>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const emptyForm = { year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1), planned: '', actual: '' }

export default function CashFlowPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.isAdmin ?? false
  const canEdit = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).cash_flow === 'edit'
    : false)

  const [records, setRecords] = useState<CashFlowWithComputed[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // Manual add/edit
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(emptyForm)

  // XER import
  const fileRef = useRef<HTMLInputElement>(null)
  const [xer,        setXer]        = useState<XerResult | null>(null)
  const [replaceAll, setReplaceAll] = useState(true)
  const [upload,     setUpload]     = useState<UploadState>(initialUpload)

  // Load animation (bars + curves grow once data is in)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { if (!loading) requestAnimationFrame(() => setMounted(true)) }, [loading])

  const fetchAll = useCallback(async () => {
    try {
      const [proj, data] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/projects/${projectId}/cashflow`),
      ])
      setProject(proj)
      setRecords(computeCF(data))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load cash flow')
    } finally {
      setLoading(false)
    }
  }, [projectId])
  useEffect(() => { fetchAll() }, [fetchAll])

  const currency = (project?.currency ?? 'SAR') as Currency

  // ── XER flow ───────────────────────────────────────────────────────────────
  function handleXerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const tables = parseXer(String(ev.target?.result ?? ''))
        if (!tables.TASK?.length) {
          setError('No TASK table found — is this a Primavera XER export?')
          return
        }
        const result = xerToCashflow(tables)
        if (!result.months.length) {
          setError('The XER has no resource/expense costs (TASKRSRC / PROJCOST) to distribute.')
          return
        }
        setError('')
        setReplaceAll(true)
        setXer(result)
      } catch {
        setError('Could not parse this file as an XER.')
      }
    }
    reader.readAsText(file)
  }

  async function applyXer() {
    if (!xer) return
    const byMonth = new Map(records.map(r => [r.monthKey, r]))
    const deletes = replaceAll ? records.map(r => r.id) : []
    const total = deletes.length + xer.months.length
    setXer(null)
    setUpload({ open: true, title: 'Importing schedule cash flow', total, done: 0, ok: 0, fail: 0, finished: false })
    let ok = 0, fail = 0

    for (const id of deletes) {
      try { await api.delete(`/api/projects/${projectId}/cashflow/${id}`); ok++ } catch { fail++ }
      setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
    }

    const fresh: CashFlowRecord[] = []
    for (const m of xer.months) {
      try {
        const existing = !replaceAll ? byMonth.get(m.monthKey) : undefined
        if (existing) {
          const updated = await api.patch(`/api/projects/${projectId}/cashflow/${existing.id}`,
            { year: m.year, month: m.month, monthKey: m.monthKey, planned: m.planned, actual: m.actual })
          fresh.push(updated)
        } else {
          const created = await api.post(`/api/projects/${projectId}/cashflow`,
            { year: m.year, month: m.month, planned: m.planned, actual: m.actual })
          fresh.push(created)
        }
        ok++
      } catch { fail++ }
      setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
    }

    // Rebuild local state: replaced → only fresh; merged → unaffected months + fresh
    const keep = replaceAll ? [] : records.filter(r => !xer.months.some(m => m.monthKey === r.monthKey))
    setRecords(computeCF([...keep, ...fresh]))
    setUpload(u => ({ ...u, finished: true }))
  }

  // ── Manual add/edit/delete ─────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const body = {
      year:  Number(form.year),
      month: Number(form.month),
      monthKey: `${form.year}-${String(form.month).padStart(2, '0')}`,
      planned: Number(form.planned) || 0,
      actual:  Number(form.actual)  || 0,
    }
    try {
      if (editId) {
        const updated = await api.patch(`/api/projects/${projectId}/cashflow/${editId}`, body)
        setRecords(prev => computeCF(prev.map(r => r.id === editId ? { ...r, ...updated } : r)))
      } else {
        const created = await api.post(`/api/projects/${projectId}/cashflow`, body)
        setRecords(prev => computeCF([...prev, created]))
      }
      setShowForm(false); setEditId(null); setForm(emptyForm)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save record')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(r: CashFlowWithComputed) {
    setEditId(r.id)
    setForm({ year: String(r.year), month: String(r.month), planned: String(r.planned), actual: String(r.actual) })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteRecord(id: string) {
    if (!confirm('Delete this month?')) return
    try {
      await api.delete(`/api/projects/${projectId}/cashflow/${id}`)
      setRecords(prev => computeCF(prev.filter(r => r.id !== id)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const totalPlanned = records.reduce((s, r) => s + r.planned, 0)
  const totalActual  = records.reduce((s, r) => s + r.actual,  0)
  const variance     = totalActual - totalPlanned

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <input ref={fileRef} type="file" accept=".xer" className="hidden" onChange={handleXerFile} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
            ← Overview
          </button>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Cash Flow</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">
            Monthly planned vs actual expenditure — import from a Primavera P6 schedule (.xer)
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { setEditId(null); setForm(emptyForm); setShowForm(v => !v) }}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              + Add Month
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="bg-[#2563FF] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#1A3FAE] transition-colors">
              ↑ Upload XER
            </button>
          </div>
        )}
      </div>

      {/* KPI band */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 grid grid-cols-2 lg:grid-cols-4 mb-4">
        {[
          { label: 'Total planned', value: formatCurrency(totalPlanned, currency), sub: `${records.length} months` },
          { label: 'Total actual',  value: formatCurrency(totalActual, currency),  sub: 'spent to date', accent: '#22c55e' },
          { label: 'Variance',      value: formatCurrency(Math.abs(variance), currency),
            sub: variance > 0 ? 'over plan' : 'under plan',
            accent: variance > 0 ? '#ef4444' : '#22c55e' },
          { label: 'Spend ratio',   value: totalPlanned > 0 ? `${Math.round(totalActual / totalPlanned * 100)}%` : '—',
            sub: 'actual vs planned' },
        ].map((s, i) => (
          <div key={s.label}
            className={`p-4 border-gray-100 dark:border-gray-800
              ${i % 2 === 1 ? 'border-s' : ''} ${i >= 2 ? 'max-lg:border-t' : ''} ${i > 0 ? 'lg:border-s' : ''}`}>
            <div className="text-[9.5px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{s.label}</div>
            <div className="text-[18px] font-bold tracking-[-0.5px] dark:text-white mt-1.5 leading-none tabular-nums"
              style={{ color: (s as any).accent }}>{s.value}</div>
            <div className="text-[11px] text-[#6B7280] dark:text-gray-500 mt-1.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Manual form */}
      {showForm && canEdit && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">
            {editId ? 'Edit Month' : 'New Month'}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Year</label>
              <input className={inputCls} type="number" min="2000" max="2100" value={form.year}
                onChange={e => setForm(f => ({ ...f, year: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Month</label>
              <select className={inputCls} value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))}>
                {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Planned ({currency})</label>
              <input className={inputCls} type="number" min="0" step="any" value={form.planned}
                onChange={e => setForm(f => ({ ...f, planned: e.target.value }))} placeholder="0" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Actual ({currency})</label>
              <input className={inputCls} type="number" min="0" step="any" value={form.actual}
                onChange={e => setForm(f => ({ ...f, actual: e.target.value }))} placeholder="0" />
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editId ? 'Update' : 'Add'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null) }}
              className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {/* Histogram */}
      {loading ? (
        <div className="h-64 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse mb-4" />
      ) : records.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl mb-4">
          <svg width="44" height="30" viewBox="0 0 44 30" className="mx-auto mb-4 text-gray-300 dark:text-gray-600">
            <rect x="2"  y="18" width="6" height="10" rx="2" fill="currentColor" />
            <rect x="12" y="12" width="6" height="16" rx="2" fill="currentColor" />
            <rect x="22" y="6"  width="6" height="22" rx="2" fill="currentColor" />
            <rect x="32" y="14" width="6" height="14" rx="2" fill="currentColor" />
            <path d="M2 16 Q 14 2 28 4 T 42 2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <p className="text-sm font-semibold text-black dark:text-white mb-1">No cash flow yet</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">
            Upload a Primavera .xer schedule to generate the monthly distribution, or add months manually.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-[11px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Cash Flow Histogram</h2>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#6B7280] dark:text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-[#2563FF]/85" />Planned / month</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-[#22c55e]/85" />Actual / month</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#2563FF]" />Cum. planned</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#22c55e]" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#22c55e 0 4px,transparent 4px 7px)' }} />Cum. actual</span>
            </div>
          </div>
          <Histogram records={records} currency={currency} mounted={mounted} />
        </div>
      )}

      {/* Monthly table */}
      {records.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px] text-center whitespace-nowrap">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {['Month','Planned','Actual','Variance','Cum. Planned','Cum. Actual',''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-black dark:text-white">{MONTH_NAMES[r.month - 1]} {r.year}</td>
                  <td className="px-4 py-3 tabular-nums text-[#374151] dark:text-gray-300">{formatCurrency(r.planned, currency)}</td>
                  <td className="px-4 py-3 tabular-nums text-[#374151] dark:text-gray-300">{r.actual > 0 ? formatCurrency(r.actual, currency) : '—'}</td>
                  <td className={`px-4 py-3 tabular-nums font-semibold ${r.variance > 0 ? 'text-red-500' : r.variance < 0 ? 'text-green-600 dark:text-green-400' : 'text-[#9CA3AF]'}`}>
                    {r.variance === 0 ? '—' : `${r.variance > 0 ? '+' : '−'}${formatCurrency(Math.abs(r.variance), currency)}`}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[#6B7280] dark:text-gray-400">{formatCurrency(r.cumulativePlanned, currency)}</td>
                  <td className="px-4 py-3 tabular-nums text-[#6B7280] dark:text-gray-400">{r.cumulativeActual > 0 ? formatCurrency(r.cumulativeActual, currency) : '—'}</td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex gap-2.5 justify-center">
                        <button onClick={() => openEdit(r)} className="text-[11px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white">Edit</button>
                        <button onClick={() => deleteRecord(r.id)} className="text-[11px] text-red-400 hover:text-red-600">Del</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* XER preview modal */}
      {xer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-10 px-4 overflow-y-auto"
          onClick={() => setXer(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-2xl mb-10"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-bold text-black dark:text-white">Schedule Cash Flow Preview</h2>
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-0.5">
                  {xer.projectName && <span className="font-mono">{xer.projectName} · </span>}
                  {fmtN(xer.taskCount)} activities · {fmtN(xer.costedTasks)} with cost
                </p>
              </div>
              <button onClick={() => setXer(null)} className="text-[#6B7280] hover:text-black dark:hover:text-white text-xl">×</button>
            </div>

            <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-gray-100 dark:border-gray-800">
              {[
                { l: 'Months',        v: fmtN(xer.months.length) },
                { l: 'Total planned', v: formatCurrency(xer.totalPlanned, currency) },
                { l: 'Total actual',  v: xer.totalActual > 0 ? formatCurrency(xer.totalActual, currency) : '—' },
              ].map(s => (
                <div key={s.l}>
                  <div className="text-[9.5px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{s.l}</div>
                  <div className="text-[15px] font-bold text-black dark:text-white tabular-nums mt-1">{s.v}</div>
                </div>
              ))}
            </div>

            <div className="max-h-[38vh] overflow-y-auto">
              <table className="w-full text-[11px] text-center">
                <thead className="sticky top-0 bg-[#F3F4F6] dark:bg-gray-800">
                  <tr>
                    {['Month','Planned','Actual'].map(h => (
                      <th key={h} className="px-4 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {xer.months.map(m => (
                    <tr key={m.monthKey}>
                      <td className="px-4 py-2 font-semibold text-black dark:text-white">{MONTH_NAMES[m.month - 1]} {m.year}</td>
                      <td className="px-4 py-2 tabular-nums">{formatCurrency(m.planned, currency)}</td>
                      <td className="px-4 py-2 tabular-nums">{m.actual > 0 ? formatCurrency(m.actual, currency) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              {records.length > 0 && (
                <label className="flex items-center gap-2 mb-3 text-[12px] text-[#374151] dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#2563FF]" />
                  Replace the {records.length} existing record{records.length !== 1 ? 's' : ''} (uncheck to merge by month)
                </label>
              )}
              <div className="flex gap-3">
                <button onClick={applyXer}
                  className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
                  Import {xer.months.length} months
                </button>
                <button onClick={() => setXer(null)}
                  className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <UploadProgressModal state={upload} onClose={() => setUpload(initialUpload)} />
    </div>
  )
}
