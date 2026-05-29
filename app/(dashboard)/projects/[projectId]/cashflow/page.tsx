'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { CashFlowRecord, CashFlowWithComputed, MONTH_NAMES, formatCurrency } from '@/lib/types'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

function computeCF(records: CashFlowRecord[]): CashFlowWithComputed[] {
  const sorted = [...records].sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  let cumP = 0, cumA = 0
  return sorted.map(r => {
    cumP += r.planned
    cumA += r.actual
    return { ...r, variance: r.actual - r.planned, cumulativePlanned: cumP, cumulativeActual: cumA }
  })
}

export default function CashFlowPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()

  const [records,  setRecords]  = useState<CashFlowWithComputed[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)

  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({
    year:    String(currentYear),
    month:   String(new Date().getMonth() + 1),
    planned: '',
    actual:  '',
  })

  const fetchCF = useCallback(async () => {
    try {
      const data: CashFlowRecord[] = await api.get(`/api/projects/${projectId}/cashflow`)
      setRecords(computeCF(data))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load cash flow')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchCF() }, [fetchCF])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const year  = Number(form.year)
    const month = Number(form.month)
    const body  = {
      year, month,
      monthKey: `${year}-${String(month).padStart(2, '0')}`,
      planned:  Number(form.planned) || 0,
      actual:   Number(form.actual)  || 0,
    }
    try {
      if (editId) {
        const updated = await api.patch(`/api/projects/${projectId}/cashflow/${editId}`, body)
        setRecords(computeCF(records.map(r => r.id === editId ? { ...r, ...updated } : r)))
      } else {
        const rec = await api.post(`/api/projects/${projectId}/cashflow`, body)
        setRecords(computeCF([...records, rec]))
      }
      setShowForm(false)
      setEditId(null)
      setForm({ year: String(currentYear), month: String(new Date().getMonth() + 1), planned: '', actual: '' })
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
  }

  async function deleteRecord(id: string) {
    if (!confirm('Delete this cash flow entry?')) return
    try {
      await api.delete(`/api/projects/${projectId}/cashflow/${id}`)
      setRecords(computeCF(records.filter(r => r.id !== id)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const totalPlanned  = records.reduce((s, r) => s + r.planned, 0)
  const totalActual   = records.reduce((s, r) => s + r.actual,  0)
  const totalVariance = totalActual - totalPlanned

  // Bar chart: max value for scaling
  const maxVal = Math.max(...records.map(r => Math.max(r.planned, r.actual)), 1)

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
            ← Overview
          </button>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Cash Flow</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">Monthly planned vs actual expenditure tracking</p>
        </div>
        <button
          onClick={() => { setEditId(null); setShowForm(v => !v) }}
          className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors"
        >
          + Add Month
        </button>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Planned',  value: formatCurrency(totalPlanned, 'SAR'),  color: undefined as string | undefined },
          { label: 'Total Actual',   value: formatCurrency(totalActual,  'SAR'),  color: '#2563FF' },
          { label: 'Total Variance', value: formatCurrency(Math.abs(totalVariance), 'SAR'),
            color: totalVariance >= 0 ? '#22c55e' : '#f97316',
            sub: totalVariance >= 0 ? 'Under budget' : 'Over budget' },
          { label: 'Cumulative CPI', value: totalPlanned > 0 ? (totalActual / totalPlanned).toFixed(2) : '—',
            color: totalActual <= totalPlanned ? '#22c55e' : '#f97316',
            sub: totalActual <= totalPlanned ? 'Cost efficient' : 'Cost overrun' },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl px-5 py-4 border border-gray-200 dark:border-gray-800">
            <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">{k.label}</div>
            <div className="text-xl font-bold tracking-[-0.3px] dark:text-white" style={{ color: k.color }}>{k.value}</div>
            {(k as any).sub && <div className="text-[10px] text-[#6B7280] dark:text-gray-400 mt-0.5">{(k as any).sub}</div>}
          </div>
        ))}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">
            {editId ? 'Edit Record' : 'New Monthly Record'}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Year</label>
              <input className={inputCls} type="number" min="2000" max="2100" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Month</label>
              <select className={inputCls} value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))}>
                {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Planned (SAR)</label>
              <input className={inputCls} type="number" min="0" step="1000" value={form.planned} onChange={e => setForm(f => ({ ...f, planned: e.target.value }))} placeholder="0" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Actual (SAR)</label>
              <input className={inputCls} type="number" min="0" step="1000" value={form.actual} onChange={e => setForm(f => ({ ...f, actual: e.target.value }))} placeholder="0" />
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

      {/* Bar chart */}
      {records.length > 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Monthly View</h3>
            <div className="flex gap-4 text-[11px] text-[#6B7280] dark:text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#2563FF]" />Planned</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#22c55e]" />Actual</span>
            </div>
          </div>
          <div className="flex items-end gap-2 h-32 overflow-x-auto">
            {records.map(r => {
              const pctP = (r.planned / maxVal) * 100
              const pctA = (r.actual  / maxVal) * 100
              return (
                <div key={r.id} className="flex items-end gap-0.5 flex-shrink-0"
                  title={`${MONTH_NAMES[r.month-1]} ${r.year}: P=${r.planned.toLocaleString()} A=${r.actual.toLocaleString()}`}>
                  <div className="w-4 rounded-t bg-[#2563FF]" style={{ height: `${pctP}%` }} />
                  <div className="w-4 rounded-t bg-[#22c55e]" style={{ height: `${pctA}%` }} />
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 mt-1 overflow-x-auto">
            {records.map(r => (
              <span key={r.id} className="w-9 flex-shrink-0 text-[9px] text-center text-[#6B7280] dark:text-gray-500">
                {MONTH_NAMES[r.month-1].slice(0,3)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">💰</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-1">No cash flow data yet</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">Add monthly planned and actual values to track project spend.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr_1fr_60px] gap-4 px-6 py-3 bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">
            <span>Month</span>
            <span className="text-right">Planned</span>
            <span className="text-right">Actual</span>
            <span className="text-right">Variance</span>
            <span className="text-right">Cum. Planned</span>
            <span className="text-right">Cum. Actual</span>
            <span></span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {records.map(r => {
              const isNeg = r.variance < 0
              return (
                <div key={r.id} className="grid grid-cols-[120px_1fr_1fr_1fr_1fr_1fr_60px] gap-4 items-center px-6 py-3.5 hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 transition-colors text-[12px]">
                  <span className="font-semibold text-black dark:text-white">{MONTH_NAMES[r.month-1]} {r.year}</span>
                  <span className="text-right text-[#374151] dark:text-gray-300">{formatCurrency(r.planned, 'SAR')}</span>
                  <span className="text-right text-[#374151] dark:text-gray-300">{formatCurrency(r.actual,  'SAR')}</span>
                  <span className={`text-right font-semibold ${isNeg ? 'text-orange-600' : 'text-green-600'}`}>
                    {isNeg ? '-' : '+'}{formatCurrency(Math.abs(r.variance), 'SAR')}
                  </span>
                  <span className="text-right text-[#6B7280] dark:text-gray-400">{formatCurrency(r.cumulativePlanned, 'SAR')}</span>
                  <span className="text-right text-[#6B7280] dark:text-gray-400">{formatCurrency(r.cumulativeActual,  'SAR')}</span>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(r)} className="text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">Edit</button>
                    <button onClick={() => deleteRecord(r.id)} className="text-red-400 hover:text-red-600 transition-colors">Del</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
