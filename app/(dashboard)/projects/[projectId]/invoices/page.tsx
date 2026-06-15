'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Invoice, InvoiceLine, BoqItem, Project, formatCurrency, fmtN } from '@/lib/types'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function InvoicesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.isAdmin ?? false
  const canEdit = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).invoices === 'edit'
    : false)

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [boq,      setBoq]      = useState<BoqItem[]>([])
  const [project,  setProject]  = useState<Project | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // Create / edit form
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [editInv,   setEditInv]   = useState<Invoice | null>(null)
  const [invNumber, setInvNumber] = useState('')
  const [invDate,   setInvDate]   = useState(todayISO())
  const [invNotes,  setInvNotes]  = useState('')
  const [qtyMap,    setQtyMap]    = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [boqSearch, setBoqSearch] = useState('')

  // Expanded invoice rows (detail view)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchAll = useCallback(async () => {
    try {
      const [invs, items, proj] = await Promise.all([
        api.get(`/api/projects/${projectId}/invoices`),
        api.get(`/api/projects/${projectId}/boq`),
        api.get(`/api/projects/${projectId}`) as Promise<Project>,
      ])
      setInvoices(invs); setBoq(items); setProject(proj)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const currency = project?.currency ?? 'SAR'
  const money = (n: number) => formatCurrency(n, currency as any)

  // ── Editor grouped by scope ─────────────────────────────────────────────────
  const sortedBoq = [...boq].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true }))
  const filteredBoq = boqSearch
    ? sortedBoq.filter(it => `${it.code} ${it.description} ${it.scope} ${it.area ?? ''} ${it.building ?? ''}`.toLowerCase().includes(boqSearch.toLowerCase()))
    : sortedBoq
  const scopeGroups = (() => {
    const map = new Map<string, BoqItem[]>()
    filteredBoq.forEach(it => { const k = it.scope || '—'; (map.get(k) ?? map.set(k, []).get(k)!).push(it) })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  })()
  const toggleCollapse = (s: string) => setCollapsed(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })

  // Running total of the invoice being edited
  const draftLines = boq
    .map(it => ({ it, qty: Number(qtyMap[it.id]) || 0 }))
    .filter(x => x.qty !== 0)
  const draftTotal = draftLines.reduce((s, { it, qty }) => s + (it.rate || 0) * qty, 0)

  // ── Form actions ─────────────────────────────────────────────────────────────
  function openNew() {
    setEditInv(null); setInvNumber(''); setInvDate(todayISO()); setInvNotes('')
    setQtyMap({}); setBoqSearch(''); setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openEdit(inv: Invoice) {
    setEditInv(inv); setInvNumber(inv.number); setInvDate(inv.date || todayISO()); setInvNotes(inv.notes ?? '')
    const m: Record<string, string> = {}
    inv.lines.forEach(l => { if (l.boqId) m[l.boqId] = String(l.qty) })
    setQtyMap(m); setBoqSearch(''); setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function setQty(id: string, v: string) {
    setQtyMap(prev => ({ ...prev, [id]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!invNumber.trim()) { setError('Invoice No. is required'); return }
    if (!invDate)          { setError('Date is required'); return }
    setSaving(true); setError('')
    const lines: InvoiceLine[] = draftLines.map(({ it, qty }) => ({
      boqId: it.id, code: it.code, description: it.description,
      scope: it.scope, area: it.area ?? '', building: it.building ?? '',
      rate: it.rate || 0, qty, amount: (it.rate || 0) * qty,
    }))
    const body = { number: invNumber.trim(), date: invDate, notes: invNotes.trim(), lines }
    try {
      if (editInv) {
        const updated = await api.patch(`/api/projects/${projectId}/invoices/${editInv.id}`, body)
        setInvoices(prev => prev.map(iv => iv.id === editInv.id ? updated : iv))
      } else {
        const created = await api.post(`/api/projects/${projectId}/invoices`, body)
        setInvoices(prev => [created, ...prev])
      }
      setShowForm(false); setEditInv(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice')
    } finally {
      setSaving(false)
    }
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice?')) return
    try {
      await api.delete(`/api/projects/${projectId}/invoices/${id}`)
      setInvoices(prev => prev.filter(iv => iv.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const grandInvoiced = invoices.reduce((s, iv) => s + (iv.total || 0), 0)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
            ← Overview
          </button>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Invoices</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">Interim invoices billed against the BOQ</p>
        </div>
        {canEdit && !showForm && (
          <button onClick={openNew}
            className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
            + New Invoice
          </button>
        )}
      </div>

      {/* Create / edit form */}
      {showForm && canEdit && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">
            {editInv ? 'Edit Invoice' : 'New Invoice'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Invoice No. *</label>
              <input className={inputCls} value={invNumber} onChange={e => setInvNumber(e.target.value)} placeholder="INV-001" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Date *</label>
              <input className={inputCls} type="date" value={invDate} onChange={e => setInvDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Notes</label>
              <input className={inputCls} value={invNotes} onChange={e => setInvNotes(e.target.value)} placeholder="optional" />
            </div>
          </div>

          {/* BOQ quantity entry */}
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[12px] font-bold text-black dark:text-white">Quantities per BOQ item</h4>
            <input className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500"
              style={{ width: 200 }} placeholder="Search BOQ…" value={boqSearch} onChange={e => setBoqSearch(e.target.value)} />
          </div>

          {boq.length === 0 ? (
            <p className="text-[12px] text-[#6B7280] dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
              No BOQ items yet — add items on the BOQ page first.
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-x-auto max-h-[55vh] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#F3F4F6] dark:bg-gray-800 z-10">
                  <tr>
                    {['ID','Description','Area / Building','Rate','BOQ Qty','Invoice Qty','Amount'].map((h, i) => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {scopeGroups.map(([scope, list]) => {
                    const isCol = collapsed.has(scope)
                    return (
                      <>
                        <tr key={`s-${scope}`} className="bg-[#F9FAFB] dark:bg-gray-800/60 select-none cursor-pointer" onClick={() => toggleCollapse(scope)}>
                          <td colSpan={7} className="px-3 py-2 text-[12px] font-bold text-black dark:text-white">
                            <span className="inline-block w-3 text-[#6B7280] dark:text-gray-400">{isCol ? '▸' : '▾'}</span> {scope}
                            <span className="ml-2 text-[10px] font-normal text-[#6B7280] dark:text-gray-400">({list.length})</span>
                          </td>
                        </tr>
                        {!isCol && list.map(it => {
                          const q = Number(qtyMap[it.id]) || 0
                          const amount = (it.rate || 0) * q
                          return (
                            <tr key={it.id} className={q !== 0 ? 'bg-[#2563FF]/5 dark:bg-blue-900/10' : ''}>
                              <td className="px-3 py-2 font-semibold text-black dark:text-white whitespace-nowrap">{it.code}</td>
                              <td className="px-3 py-2 text-[#374151] dark:text-gray-300 max-w-[260px] truncate">{it.description}</td>
                              <td className="px-3 py-2 text-[11px] text-[#6B7280] dark:text-gray-400">
                                {[it.area, it.building].filter(Boolean).join(' · ') || '—'}
                              </td>
                              <td className="px-3 py-2 text-right text-[#374151] dark:text-gray-300 tabular-nums">{fmtN(it.rate, 2)}</td>
                              <td className="px-3 py-2 text-right text-[#9CA3AF] dark:text-gray-500 tabular-nums">{fmtN(it.qty, 2)}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number" step="any" min="0"
                                  value={qtyMap[it.id] ?? ''}
                                  onChange={e => setQty(it.id, e.target.value)}
                                  placeholder="0"
                                  className="w-24 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-[12px] text-right bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-[#2563FF] tabular-nums"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-black dark:text-white tabular-nums whitespace-nowrap">
                                {amount ? money(amount) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Total + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#6B7280] dark:text-gray-400">Invoice total ({draftLines.length} items):</span>
              <span className="text-[16px] font-bold text-black dark:text-white">{money(draftTotal)}</span>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : editInv ? 'Update Invoice' : 'Save Invoice'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditInv(null); setError('') }}
                className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        </form>
      )}

      {error && !showForm && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {/* Invoice list */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : invoices.length === 0 ? (
        !showForm && (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
            <div className="text-3xl mb-3">🧾</div>
            <p className="text-sm font-semibold text-black dark:text-white mb-1">No invoices yet</p>
            <p className="text-[12px] text-[#6B7280] dark:text-gray-400">{canEdit ? 'Create an invoice and enter the billed quantity for each BOQ item.' : 'No invoices have been created.'}</p>
          </div>
        )
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {['Invoice No.','Date','Items','Total',''].map((h, i) => (
                  <th key={i} className={`px-4 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {invoices.map(inv => {
                const isOpen = expanded.has(inv.id)
                return (
                  <>
                    <tr key={inv.id} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => toggleExpand(inv.id)}>
                      <td className="px-4 py-3 font-semibold text-black dark:text-white whitespace-nowrap">
                        <span className="inline-block w-3 text-[#6B7280] dark:text-gray-400">{isOpen ? '▾' : '▸'}</span> {inv.number}
                      </td>
                      <td className="px-4 py-3 text-[#374151] dark:text-gray-300 whitespace-nowrap">{inv.date || '—'}</td>
                      <td className="px-4 py-3 text-[#374151] dark:text-gray-300">{inv.lines?.length ?? 0}</td>
                      <td className="px-4 py-3 text-right font-bold text-black dark:text-white tabular-nums whitespace-nowrap">{money(inv.total || 0)}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2 justify-end whitespace-nowrap">
                          {canEdit && (
                            <>
                              <button onClick={() => openEdit(inv)} className="text-[11px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white">Edit</button>
                              <button onClick={() => deleteInvoice(inv.id)} className="text-[11px] text-red-400 hover:text-red-600">Del</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${inv.id}-detail`} className="bg-[#F9FAFB] dark:bg-gray-800/40">
                        <td colSpan={5} className="px-4 py-3">
                          {inv.notes && <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mb-2">📝 {inv.notes}</p>}
                          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="w-full text-[11px]">
                              <thead className="bg-[#F3F4F6] dark:bg-gray-800">
                                <tr>
                                  {['ID','Description','Scope','Area / Building','Rate','Qty','Amount'].map((h, i) => (
                                    <th key={h} className={`px-3 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {inv.lines.map((l: InvoiceLine, i) => (
                                  <tr key={`${l.boqId}-${i}`} className="bg-white dark:bg-gray-900">
                                    <td className="px-3 py-2 font-semibold text-black dark:text-white whitespace-nowrap">{l.code}</td>
                                    <td className="px-3 py-2 text-[#374151] dark:text-gray-300 max-w-[260px] truncate">{l.description}</td>
                                    <td className="px-3 py-2 text-[#374151] dark:text-gray-300">{l.scope}</td>
                                    <td className="px-3 py-2 text-[#6B7280] dark:text-gray-400">{[l.area, l.building].filter(Boolean).join(' · ') || '—'}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmtN(l.rate, 2)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmtN(l.qty, 2)}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-black dark:text-white tabular-nums whitespace-nowrap">{money(l.amount || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                <td className="px-4 py-3 text-[11px] font-bold text-black dark:text-white uppercase tracking-wider" colSpan={3}>
                  Total invoiced ({invoices.length})
                </td>
                <td className="px-4 py-3 text-right text-[12px] font-bold text-black dark:text-white tabular-nums whitespace-nowrap">{money(grandInvoiced)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
