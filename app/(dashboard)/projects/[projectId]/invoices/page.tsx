'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Invoice, InvoiceLine, BoqItem, Project, formatCurrency, fmtN } from '@/lib/types'
import { UploadProgressModal, type UploadState, initialUpload } from '@/lib/upload-progress'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

const todayISO = () => new Date().toISOString().slice(0, 10)

// A draft invoice parsed from an uploaded Excel file (long format: one row per
// invoice-line). Multiple invoices are grouped by their Invoice No.
interface BulkInvoice {
  number: string
  date:   string
  paid:   boolean
  paymentDate: string
  lines:  InvoiceLine[]
  total:  number
  unknownCodes: string[]   // codes in the file that don't match any BOQ item
  isUpdate:   boolean      // true when an invoice with this number already exists
  existingId?: string      // the existing invoice's id (for update)
  error?: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')
// Accept either a typed string (YYYY-MM-DD / parseable) or an Excel serial number.
function toISODate(v: any): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))   // Excel serial → UTC date
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return s
}

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
  const [invPaid,   setInvPaid]   = useState(false)
  const [invPayDate, setInvPayDate] = useState('')
  const [qtyMap,    setQtyMap]    = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [boqSearch, setBoqSearch] = useState('')

  // Expanded invoice rows (detail view)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Bulk upload (multiple invoices at once)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [bulkInvoices, setBulkInvoices] = useState<BulkInvoice[]>([])
  const [bulkSkipped,  setBulkSkipped]  = useState(0)
  const [showBulk,     setShowBulk]     = useState(false)
  const [bulkSaving,   setBulkSaving]   = useState(false)
  const [upload,       setUpload]       = useState<UploadState>(initialUpload)

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

  // ── Editor grouped by scope — preserves the order items were entered in the
  //    BOQ (the API returns them in creation order; we don't re-sort). ──────────
  const filteredBoq = boqSearch
    ? boq.filter(it => `${it.code} ${it.description} ${it.scope} ${it.area ?? ''} ${it.building ?? ''}`.toLowerCase().includes(boqSearch.toLowerCase()))
    : boq
  const scopeGroups = (() => {
    const map = new Map<string, BoqItem[]>()
    // Map preserves first-seen key order, so scopes appear in BOQ order and the
    // items within each scope keep their original BOQ sequence.
    filteredBoq.forEach(it => { const k = it.scope || '—'; (map.get(k) ?? map.set(k, []).get(k)!).push(it) })
    return [...map.entries()]
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
    setInvPaid(false); setInvPayDate('')
    setQtyMap({}); setBoqSearch(''); setError('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openEdit(inv: Invoice) {
    setEditInv(inv); setInvNumber(inv.number); setInvDate(inv.date || todayISO()); setInvNotes(inv.notes ?? '')
    setInvPaid(!!inv.paid); setInvPayDate(inv.paymentDate ?? '')
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
    const body = {
      number: invNumber.trim(), date: invDate, notes: invNotes.trim(), lines,
      paid: invPaid, paymentDate: invPaid ? invPayDate : '',
    }
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

  async function togglePaid(inv: Invoice) {
    const paid = !inv.paid
    try {
      const updated = await api.patch(`/api/projects/${projectId}/invoices/${inv.id}`, {
        paid, paymentDate: paid ? (inv.paymentDate || todayISO()) : '',
      })
      setInvoices(prev => prev.map(iv => iv.id === inv.id ? updated : iv))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update payment status')
    }
  }

  const grandInvoiced = invoices.reduce((s, iv) => s + (iv.total || 0), 0)
  const paidTotal     = invoices.filter(iv => iv.paid).reduce((s, iv) => s + (iv.total || 0), 0)
  const pendingTotal  = grandInvoiced - paidTotal
  // Display ascending by invoice No. (numeric-aware: INV-1, INV-2, … INV-10)
  const displayInvoices = [...invoices].sort((a, b) =>
    (a.number || '').localeCompare(b.number || '', undefined, { numeric: true, sensitivity: 'base' }))

  // ── Bulk upload (many invoices in one Excel) ─────────────────────────────────
  const BULK_HEADERS = ['Invoice No.', 'Date', 'ID', 'Description', 'Qty', 'Paid', 'Payment Date']

  async function downloadBulkTemplate() {
    const XLSX = await import('xlsx')
    // Pre-list every existing BOQ item (in BOQ order) under one example invoice
    // so the user only fills the Qty column and can duplicate the block per invoice.
    const example = todayISO()
    const rows = boq.length
      ? boq.map(it => ['INV-001', example, it.code, it.description, ''])
      : [['INV-001', example, 'C-101', 'Example item', '10']]
    const ws = XLSX.utils.aoa_to_sheet([BULK_HEADERS, ...rows])
    ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 44 }, { wch: 12 }, { wch: 10 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    // Reference sheet: existing BOQ items
    const refHead = ['ID', 'Description', 'Scope', 'Area', 'Building', 'Rate']
    const refRows = boq.map(it => [it.code, it.description, it.scope, it.area ?? '', it.building ?? '', it.rate ?? 0])
    const refWs = XLSX.utils.aoa_to_sheet([refHead, ...refRows])
    refWs['!cols'] = [{ wch: 16 }, { wch: 44 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, refWs, 'BOQ Items')
    XLSX.writeFile(wb, 'pmboards-invoices-template.xlsx')
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const XLSX = await import('xlsx')
    const byCode = new Map(boq.map(it => [it.code.toLowerCase(), it]))
    // Existing invoices keyed by number → re-importing the same No. updates it.
    const byNumber = new Map(invoices.map(iv => [iv.number.trim().toLowerCase(), iv]))

    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target!.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]
      if (rows.length < 2) { setError('File has no data rows'); return }

      const [headerRow, ...dataRows] = rows
      const find = (re: RegExp) => headerRow.findIndex((_: any, i: number) => re.test(String(headerRow[i])))
      const col = {
        number:  find(/invoice|\bno\.?\b/i),
        date:    find(/^date|invoice ?date/i),
        code:    find(/\bid\b|code/i),
        qty:     find(/qty|quan/i),
        paid:    find(/paid/i),
        payDate: find(/payment ?date|pay ?date|paid ?date/i),
      }
      const cell = (row: any[], i: number) => i >= 0 ? row[i] : ''
      const isTruthy = (v: any) => /^(y|yes|true|1|paid|done|✓)/i.test(String(v ?? '').trim())

      // Group rows by invoice number, preserving first-seen order.
      const groups = new Map<string, { date: string; paid: boolean; paymentDate: string; rows: { code: string; qty: number }[] }>()
      let skipped = 0
      dataRows.forEach(row => {
        if (!row.some((c: any) => String(c).trim())) return
        const number = String(cell(row, col.number) ?? '').trim()
        if (!number) { skipped++; return }
        const date = toISODate(cell(row, col.date))
        const code = String(cell(row, col.code) ?? '').trim()
        const qty  = parseFloat(String(cell(row, col.qty) ?? '')) || 0
        const g = groups.get(number) ?? groups.set(number, { date: '', paid: false, paymentDate: '', rows: [] }).get(number)!
        if (date && !g.date) g.date = date
        if (col.paid >= 0 && isTruthy(cell(row, col.paid))) g.paid = true
        const pd = toISODate(cell(row, col.payDate))
        if (pd && !g.paymentDate) g.paymentDate = pd
        g.rows.push({ code, qty })
      })

      const drafts: BulkInvoice[] = [...groups.entries()].map(([number, g]) => {
        const lines: InvoiceLine[] = []
        const unknownCodes: string[] = []
        g.rows.forEach(({ code, qty }) => {
          if (!code || qty === 0) return
          const it = byCode.get(code.toLowerCase())
          if (!it) { unknownCodes.push(code); return }
          lines.push({
            boqId: it.id, code: it.code, description: it.description,
            scope: it.scope, area: it.area ?? '', building: it.building ?? '',
            rate: it.rate || 0, qty, amount: (it.rate || 0) * qty,
          })
        })
        const total = lines.reduce((s, l) => s + l.amount, 0)
        const existing = byNumber.get(number.trim().toLowerCase())
        const paid = g.paid || !!g.paymentDate
        const error = !g.date ? 'Missing date' : lines.length === 0 ? 'No valid lines' : undefined
        return { number, date: g.date, paid, paymentDate: paid ? (g.paymentDate || g.date) : '', lines, total, unknownCodes, isUpdate: !!existing, existingId: existing?.id, error }
      })

      setBulkInvoices(drafts); setBulkSkipped(skipped); setShowBulk(true)
    }
    reader.readAsBinaryString(file)
  }

  async function confirmBulkUpload() {
    const valid = bulkInvoices.filter(b => !b.error)
    if (!valid.length) return
    setBulkSaving(true); setShowBulk(false)
    setUpload({ open: true, title: 'Uploading invoices', total: valid.length, done: 0, ok: 0, fail: 0, finished: false })
    let ok = 0, fail = 0
    for (const b of valid) {
      try {
        if (b.isUpdate && b.existingId) {
          const updated = await api.patch(`/api/projects/${projectId}/invoices/${b.existingId}`, {
            number: b.number, date: b.date, lines: b.lines, paid: b.paid, paymentDate: b.paymentDate,
          })
          setInvoices(prev => prev.map(iv => iv.id === b.existingId ? updated : iv))
        } else {
          const created = await api.post(`/api/projects/${projectId}/invoices`, {
            number: b.number, date: b.date, notes: '', lines: b.lines, paid: b.paid, paymentDate: b.paymentDate,
          })
          setInvoices(prev => [created, ...prev])
        }
        ok++
      } catch { fail++ }
      setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
    }
    setUpload(u => ({ ...u, finished: true }))
    setBulkInvoices([]); setBulkSaving(false)
  }

  const validBulkCount = bulkInvoices.filter(b => !b.error).length

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

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
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadBulkTemplate}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              ↓ Template
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="border border-[#2563FF] text-[#2563FF] text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              title="Import .xlsx — one row per invoice line (Invoice No., Date, BOQ ID, Qty). Multiple invoices in one file.">
              ↑ Import
            </button>
            <button onClick={openNew}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
              + New Invoice
            </button>
          </div>
        )}
      </div>

      {/* Bulk upload preview */}
      {showBulk && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-3xl mb-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-bold text-black dark:text-white">Bulk Upload Preview</h2>
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-0.5">
                  {bulkInvoices.filter(b => !b.error && !b.isUpdate).length} add · {bulkInvoices.filter(b => !b.error && b.isUpdate).length} update · {bulkInvoices.length - validBulkCount} error
                  {bulkSkipped > 0 && ` · ${bulkSkipped} rows skipped (no Invoice No.)`}
                </p>
              </div>
              <button onClick={() => { setShowBulk(false); setBulkInvoices([]) }}
                className="text-[#6B7280] hover:text-black dark:hover:text-white text-xl">×</button>
            </div>
            <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#F3F4F6] dark:bg-gray-800">
                  <tr>
                    {['Invoice No.','Action','Date','Items','Total','Status'].map((h, i) => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {bulkInvoices.map((b, i) => (
                    <tr key={`${b.number}-${i}`} className={b.error ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                      <td className="px-3 py-2 font-semibold text-black dark:text-white">{b.number}</td>
                      <td className="px-3 py-2">
                        {b.isUpdate
                          ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Update</span>
                          : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Add</span>}
                      </td>
                      <td className="px-3 py-2 text-[#374151] dark:text-gray-300">{b.date || '—'}</td>
                      <td className="px-3 py-2 text-[#374151] dark:text-gray-300">{b.lines.length}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">{money(b.total)}</td>
                      <td className="px-3 py-2">
                        {b.error
                          ? <span className="text-red-500 text-[10px]">{b.error}</span>
                          : <span className="text-green-600 font-semibold text-[10px]">
                              ✓ Ready{b.unknownCodes.length ? ` · ${b.unknownCodes.length} unknown ID skipped` : ''}
                            </span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={confirmBulkUpload} disabled={bulkSaving || validBulkCount === 0}
                className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
                {bulkSaving ? `Saving… (${validBulkCount})` : `Save ${validBulkCount} Invoice${validBulkCount !== 1 ? 's' : ''}`}
              </button>
              <button type="button" onClick={() => { setShowBulk(false); setBulkInvoices([]) }}
                className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

          {/* Payment status */}
          <div className="flex flex-wrap items-center gap-4 mb-5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={invPaid}
                onChange={e => { setInvPaid(e.target.checked); if (e.target.checked && !invPayDate) setInvPayDate(todayISO()) }}
                className="w-4 h-4 rounded accent-[#22c55e] cursor-pointer" />
              <span className="text-[12px] font-semibold text-black dark:text-white">Paid</span>
            </label>
            {invPaid && (
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-[#374151] dark:text-gray-300">Payment date</label>
                <input type="date" value={invPayDate} onChange={e => setInvPayDate(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500" />
              </div>
            )}
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
                {['Invoice No.','Date','Items','Total','Status',''].map((h, i) => (
                  <th key={i} className={`px-4 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {displayInvoices.map(inv => {
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
                      <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        {canEdit ? (
                          <button onClick={() => togglePaid(inv)} title="Toggle paid"
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                              inv.paid
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200'
                            }`}>
                            {inv.paid ? '✓ Paid' : 'Unpaid'}
                          </button>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inv.paid ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                            {inv.paid ? '✓ Paid' : 'Unpaid'}
                          </span>
                        )}
                        {inv.paid && inv.paymentDate && (
                          <span className="ml-2 text-[10px] text-[#9CA3AF] dark:text-gray-500">{inv.paymentDate}</span>
                        )}
                      </td>
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
                        <td colSpan={6} className="px-4 py-3">
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
                <td className="px-4 py-3 text-[11px] text-[#6B7280] dark:text-gray-400 whitespace-nowrap" colSpan={2}>
                  <span className="text-green-600 dark:text-green-400 font-semibold">{money(paidTotal)} paid</span>
                  {' · '}
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{money(pendingTotal)} pending</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Animated upload progress */}
      <UploadProgressModal state={upload} onClose={() => setUpload(initialUpload)} />
    </div>
  )
}
