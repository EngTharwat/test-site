'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import {
  BoqItem, Zone, Project, BOQ_TRADES,
  ZONE_TYPES_BY_PROJECT, formatCurrency, fmtN,
} from '@/lib/types'
import { UploadProgressModal, type UploadState, initialUpload } from '@/lib/upload-progress'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const filterCls = 'border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500'

// ── Bulk row type ─────────────────────────────────────────────────────────────
interface BulkRow {
  rowNum: number
  code: string; scope: string; area: string; building: string
  trade: string; activity: string; description: string
  rate: number; qty: number
  isUpdate: boolean; existingId?: string
  error?: string
}

const emptyForm = {
  scope: '', area: '', building: '', trade: '', activity: '',
  code: '', description: '', rate: '', qty: '',
}

const BOQ_HEADERS = ['ID','Scope','Area','Building','Trade','Activity','Description','Rate','Qty']
const BOQ_COLW = [{wch:16},{wch:20},{wch:20},{wch:16},{wch:14},{wch:18},{wch:40},{wch:12},{wch:10}]

export default function BoqPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.isAdmin ?? false
  const canEdit = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).boq === 'edit'
    : false)

  const [items,    setItems]    = useState<BoqItem[]>([])
  const [zones,    setZones]    = useState<Zone[]>([])
  const [project,  setProject]  = useState<Project | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [editItem, setEditItem] = useState<BoqItem | null>(null)
  const [form,     setForm]     = useState(emptyForm)

  // Filters
  const [fScope,  setFScope]  = useState('')
  const [fArea,   setFArea]   = useState('')
  const [fTrade,  setFTrade]  = useState('')
  const [fSearch, setFSearch] = useState('')

  // Bulk upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [bulkRows,   setBulkRows]   = useState<BulkRow[]>([])
  const [showBulk,   setShowBulk]   = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [upload,     setUpload]     = useState<UploadState>(initialUpload)

  // Row selection + bulk delete
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [deletingBulk, setDeletingBulk] = useState(false)

  // Collapsed scopes
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapse = (s: string) => setCollapsed(prev => {
    const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next
  })

  const fetchAll = useCallback(async () => {
    try {
      const [its, zns, proj] = await Promise.all([
        api.get(`/api/projects/${projectId}/boq`),
        api.get(`/api/projects/${projectId}/zones`),
        api.get(`/api/projects/${projectId}`) as Promise<Project>,
      ])
      setItems(its); setZones(zns); setProject(proj)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Valid project scopes & areas ────────────────────────────────────────────
  const projectType = project?.projectType ?? 'other'
  const scopeOptions = [...new Set([
    ...(ZONE_TYPES_BY_PROJECT[projectType] ?? ZONE_TYPES_BY_PROJECT.other ?? []),
    ...zones.map(z => z.type).filter(Boolean),
  ])]
  const areaOptions = [...new Set(zones.map(z => z.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const currency = project?.currency ?? 'SAR'
  const money = (n: number) => formatCurrency(n, currency as any)

  // ── Filters ──────────────────────────────────────────────────────────────
  const displayed = items.filter(it => {
    if (fScope && it.scope !== fScope) return false
    if (fArea  && (it.area || '') !== fArea) return false
    if (fTrade && (it.trade || '') !== fTrade) return false
    if (fSearch) {
      const q = fSearch.toLowerCase()
      if (!(`${it.code} ${it.description}`.toLowerCase().includes(q))) return false
    }
    return true
  })
  const grandTotal = displayed.reduce((s, it) => s + (it.totalPrice || 0), 0)
  const uniqueTrades = [...new Set(items.map(i => i.trade).filter(Boolean))].sort()

  // ── Group by scope ──────────────────────────────────────────────────────────
  const scopeGroups = (() => {
    const map = new Map<string, BoqItem[]>()
    displayed.forEach(it => {
      const k = it.scope || '—'
      ;(map.get(k) ?? map.set(k, []).get(k)!).push(it)
    })
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([scope, list]) => ({
        scope,
        list: [...list].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true })),
        total: list.reduce((s, x) => s + (x.totalPrice || 0), 0),
      }))
  })()

  // ── Bulk upload ──────────────────────────────────────────────────────────────
  function appendReferenceSheets(XLSX: any, wb: any) {
    const scopeWs = XLSX.utils.aoa_to_sheet([['Scope (copy exact value into Scope column)'], ...scopeOptions.map(s => [s])])
    scopeWs['!cols'] = [{ wch: 36 }]
    XLSX.utils.book_append_sheet(wb, scopeWs, 'Scopes Reference')
    if (areaOptions.length) {
      const areaWs = XLSX.utils.aoa_to_sheet([['Area (copy exact value into Area column)'], ...areaOptions.map(a => [a])])
      areaWs['!cols'] = [{ wch: 36 }]
      XLSX.utils.book_append_sheet(wb, areaWs, 'Areas Reference')
    }
    const tradeWs = XLSX.utils.aoa_to_sheet([['Trade'], ...BOQ_TRADES.map(t => [t])])
    tradeWs['!cols'] = [{ wch: 24 }]
    XLSX.utils.book_append_sheet(wb, tradeWs, 'Trades Reference')
  }

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const example = ['C-101', scopeOptions[0] ?? 'Gravity', areaOptions[0] ?? '', '', 'Civil',
                     'Excavation', 'Excavation in all types of soil', '35.5', '1200']
    const ws = XLSX.utils.aoa_to_sheet([BOQ_HEADERS, example])
    ws['!cols'] = BOQ_COLW
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BOQ')
    appendReferenceSheets(XLSX, wb)
    XLSX.writeFile(wb, 'pmboards-boq-template.xlsx')
  }

  async function exportItems() {
    const XLSX = await import('xlsx')
    const rows = displayed.map(it => [
      it.code, it.scope, it.area ?? '', it.building ?? '', it.trade ?? '',
      it.activity ?? '', it.description, it.rate ?? 0, it.qty ?? 0,
    ])
    const ws = XLSX.utils.aoa_to_sheet([BOQ_HEADERS, ...rows])
    ws['!cols'] = BOQ_COLW
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BOQ')
    appendReferenceSheets(XLSX, wb)
    XLSX.writeFile(wb, `pmboards-boq-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const XLSX = await import('xlsx')

    // canonical lookups (case-insensitive) for scope / trade normalisation
    const scopeByLower = new Map(scopeOptions.map(s => [s.toLowerCase(), s]))
    const tradeByLower = new Map(BOQ_TRADES.map(t => [t.toLowerCase(), t as string]))
    const byCode = new Map(items.map(it => [it.code.toLowerCase(), it]))

    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target!.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]
      if (rows.length < 2) { setError('File has no data rows'); return }

      const [headerRow, ...dataRows] = rows
      const find = (re: RegExp) => headerRow.findIndex((_: any, i: number) => re.test(String(headerRow[i])))
      const col = {
        code:        find(/\bid\b|code/i),
        scope:       find(/scope/i),
        area:        find(/area/i),
        building:    find(/build/i),
        trade:       find(/trade/i),
        activity:    find(/activ/i),
        description: find(/desc/i),
        rate:        find(/rate|unit ?price/i),
        qty:         find(/qty|quan/i),
      }
      const cell = (row: any[], i: number) => i >= 0 ? String(row[i] ?? '').trim() : ''

      const parsed: BulkRow[] = dataRows
        .filter(row => row.some((c: any) => String(c).trim()))
        .map((row, idx) => {
          const code        = cell(row, col.code)
          const scopeRaw    = cell(row, col.scope)
          const scope       = scopeByLower.get(scopeRaw.toLowerCase()) ?? scopeRaw
          const description = cell(row, col.description)
          const tradeRaw    = cell(row, col.trade)
          const trade       = tradeByLower.get(tradeRaw.toLowerCase()) ?? tradeRaw
          const rateStr     = cell(row, col.rate)
          const qtyStr      = cell(row, col.qty)
          const rate        = parseFloat(rateStr)
          const qty         = parseFloat(qtyStr)
          const existing    = code ? byCode.get(code.toLowerCase()) : undefined

          const errors: string[] = []
          if (!code)        errors.push('ID required')
          if (!scopeRaw)    errors.push('Scope required')
          else if (!scopeByLower.has(scopeRaw.toLowerCase())) errors.push(`Scope "${scopeRaw}" not valid`)
          if (!description) errors.push('Description required')
          if (rateStr === '' || !Number.isFinite(rate)) errors.push('Rate required')
          if (qtyStr  === '' || !Number.isFinite(qty))  errors.push('Qty required')

          return {
            rowNum:      idx + 2,
            code, scope,
            area:        cell(row, col.area),
            building:    cell(row, col.building),
            trade,
            activity:    cell(row, col.activity),
            description,
            rate:        Number.isFinite(rate) ? rate : 0,
            qty:         Number.isFinite(qty)  ? qty  : 0,
            isUpdate:    !!existing,
            existingId:  existing?.id,
            error:       errors.join('; ') || undefined,
          }
        })

      setBulkRows(parsed); setShowBulk(true)
    }
    reader.readAsBinaryString(file)
  }

  async function confirmBulkUpload() {
    const valid = bulkRows.filter(r => !r.error)
    if (!valid.length) return
    setBulkSaving(true); setShowBulk(false)
    setUpload({ open: true, title: 'Uploading BOQ items', total: valid.length, done: 0, ok: 0, fail: 0, finished: false })
    let ok = 0, fail = 0
    for (const row of valid) {
      const body = {
        scope: row.scope, area: row.area, building: row.building, trade: row.trade,
        activity: row.activity, code: row.code, description: row.description,
        rate: row.rate, qty: row.qty,
      }
      try {
        if (row.isUpdate && row.existingId) {
          const updated = await api.patch(`/api/projects/${projectId}/boq/${row.existingId}`, body)
          setItems(prev => prev.map(it => it.id === row.existingId ? updated : it))
        } else {
          const created = await api.post(`/api/projects/${projectId}/boq`, body)
          setItems(prev => [created, ...prev])
        }
        ok++
      } catch { fail++ }
      setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
    }
    setUpload(u => ({ ...u, finished: true }))
    setBulkRows([]); setBulkSaving(false)
  }

  // ── Manual form ──────────────────────────────────────────────────────────────
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  function openEdit(it: BoqItem) {
    setEditItem(it)
    setForm({
      scope: it.scope, area: it.area ?? '', building: it.building ?? '',
      trade: it.trade ?? '', activity: it.activity ?? '',
      code: it.code, description: it.description,
      rate: String(it.rate ?? ''), qty: String(it.qty ?? ''),
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.scope)              { setError('Scope is required'); return }
    if (!form.code.trim())        { setError('ID is required'); return }
    if (!form.description.trim()) { setError('Description is required'); return }
    if (form.rate === '')         { setError('Rate is required'); return }
    if (form.qty === '')          { setError('Qty is required'); return }
    setSaving(true); setError('')
    const body = {
      scope: form.scope, area: form.area, building: form.building.trim(),
      trade: form.trade, activity: form.activity.trim(),
      code: form.code.trim(), description: form.description.trim(),
      rate: Number(form.rate) || 0, qty: Number(form.qty) || 0,
    }
    try {
      if (editItem) {
        const updated = await api.patch(`/api/projects/${projectId}/boq/${editItem.id}`, body)
        setItems(prev => prev.map(it => it.id === editItem.id ? updated : it))
      } else {
        const created = await api.post(`/api/projects/${projectId}/boq`, body)
        setItems(prev => [created, ...prev])
      }
      setForm(emptyForm); setShowForm(false); setEditItem(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save BOQ item')
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this BOQ item?')) return
    try {
      await api.delete(`/api/projects/${projectId}/boq/${id}`)
      setItems(prev => prev.filter(it => it.id !== id))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleSel = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleScopeSel = (ids: string[]) =>
    setSelected(prev => {
      const n = new Set(prev); const allOn = ids.every(id => n.has(id))
      ids.forEach(id => allOn ? n.delete(id) : n.add(id)); return n
    })
  const displayedIds = displayed.map(i => i.id)
  const allSelected  = displayedIds.length > 0 && displayedIds.every(id => selected.has(id))
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(displayedIds))

  async function deleteSelected() {
    const ids = displayed.filter(i => selected.has(i.id)).map(i => i.id)
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} selected item${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeletingBulk(true)
    setUpload({ open: true, title: 'Deleting BOQ items', total: ids.length, done: 0, ok: 0, fail: 0, finished: false })
    let ok = 0, fail = 0
    for (const id of ids) {
      try { await api.delete(`/api/projects/${projectId}/boq/${id}`); setItems(prev => prev.filter(i => i.id !== id)); ok++ }
      catch { fail++ }
      setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
    }
    setUpload(u => ({ ...u, finished: true }))
    setSelected(new Set()); setDeletingBulk(false)
  }

  const validBulkCount = bulkRows.filter(r => !r.error).length
  const hasFilter = !!(fScope || fArea || fTrade || fSearch)
  const livePreviewTotal = (Number(form.rate) || 0) * (Number(form.qty) || 0)

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
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Bill of Quantities</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">Priced BOQ items by scope, area, building, trade &amp; activity</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadTemplate}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              ↓ Template
            </button>
            <button onClick={exportItems} disabled={items.length === 0}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
              title="Download current BOQ to edit in Excel">
              ⬇ Export
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="border border-[#2563FF] text-[#2563FF] text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              title="Import .xlsx — rows whose ID matches an existing item update it, others are added">
              ↑ Import
            </button>
            <button onClick={() => { setForm(emptyForm); setEditItem(null); setShowForm(v => !v) }}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
              + Add Item
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <select className={filterCls} value={fScope} onChange={e => setFScope(e.target.value)}>
          <option value="">All Scopes</option>
          {scopeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={filterCls} value={fArea} onChange={e => setFArea(e.target.value)}>
          <option value="">All Areas</option>
          {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className={filterCls} value={fTrade} onChange={e => setFTrade(e.target.value)}>
          <option value="">All Trades</option>
          {uniqueTrades.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className={filterCls} style={{ width: 180 }} placeholder="Search ID / description" value={fSearch} onChange={e => setFSearch(e.target.value)} />
        <span className="ml-auto text-[12px] text-[#6B7280] dark:text-gray-400">
          {displayed.length} items · <span className="font-semibold text-black dark:text-white">{money(grandTotal)}</span>
        </span>
        {hasFilter && (
          <button onClick={() => { setFScope(''); setFArea(''); setFTrade(''); setFSearch('') }}
            className="text-[11px] text-red-400 hover:text-red-600 transition-colors">✕ Clear</button>
        )}
      </div>

      {/* Manual form */}
      {showForm && canEdit && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">
            {editItem ? 'Edit BOQ Item' : 'New BOQ Item'}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Scope *</label>
              <select className={inputCls} value={form.scope} onChange={set('scope')} required>
                <option value="">— Select Scope —</option>
                {scopeOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Area</label>
              <select className={inputCls} value={form.area} onChange={set('area')}>
                <option value="">— None —</option>
                {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Building</label>
              <input className={inputCls} value={form.building} onChange={set('building')} placeholder="e.g. Pump House" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Trade</label>
              <select className={inputCls} value={form.trade} onChange={set('trade')}>
                <option value="">— None —</option>
                {BOQ_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Activity</label>
              <input className={inputCls} value={form.activity} onChange={set('activity')} placeholder="e.g. Excavation" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">ID *</label>
              <input className={inputCls} value={form.code} onChange={set('code')} placeholder="C-101" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Rate *</label>
              <input className={inputCls} type="number" min="0" step="any" value={form.rate} onChange={set('rate')} placeholder="35.5" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Qty *</label>
              <input className={inputCls} type="number" min="0" step="any" value={form.qty} onChange={set('qty')} placeholder="1200" required />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Description *</label>
              <input className={inputCls} value={form.description} onChange={set('description')} placeholder="Excavation in all types of soil…" required />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-[#6B7280] dark:text-gray-400">Total price:</span>
            <span className="text-[13px] font-bold text-black dark:text-white">{money(livePreviewTotal)}</span>
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editItem ? 'Update Item' : 'Add Item'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditItem(null); setForm(emptyForm); setError('') }}
              className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {/* Bulk upload modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-5xl mb-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-bold text-black dark:text-white">Bulk Upload Preview</h2>
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-0.5">
                  {bulkRows.filter(r => !r.error && r.isUpdate).length} update · {bulkRows.filter(r => !r.error && !r.isUpdate).length} add · {bulkRows.length - validBulkCount} error
                </p>
              </div>
              <button onClick={() => { setShowBulk(false); setBulkRows([]) }}
                className="text-[#6B7280] hover:text-black dark:hover:text-white text-xl">×</button>
            </div>
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[#F3F4F6] dark:bg-gray-800">
                  <tr>
                    {['Row','Action','ID','Scope','Area','Trade','Description','Rate','Qty','Total','Status'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {bulkRows.map(row => (
                    <tr key={row.rowNum} className={row.error ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                      <td className="px-3 py-2 text-[#6B7280]">{row.rowNum}</td>
                      <td className="px-3 py-2">
                        {row.isUpdate
                          ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Update</span>
                          : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Add</span>}
                      </td>
                      <td className="px-3 py-2 font-semibold text-black dark:text-white">{row.code || '—'}</td>
                      <td className="px-3 py-2 max-w-[140px] truncate">{row.scope || '—'}</td>
                      <td className="px-3 py-2 max-w-[120px] truncate">{row.area || '—'}</td>
                      <td className="px-3 py-2">{row.trade || '—'}</td>
                      <td className="px-3 py-2 max-w-[220px] truncate text-[#374151] dark:text-gray-300">{row.description || '—'}</td>
                      <td className="px-3 py-2 text-right">{fmtN(row.rate, 2)}</td>
                      <td className="px-3 py-2 text-right">{fmtN(row.qty, 2)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtN(row.rate * row.qty, 2)}</td>
                      <td className="px-3 py-2">
                        {row.error
                          ? <span className="text-red-500 text-[10px]">{row.error}</span>
                          : <span className="text-green-600 font-semibold text-[10px]">✓ Ready</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={confirmBulkUpload} disabled={bulkSaving || validBulkCount === 0}
                className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
                {bulkSaving ? `Saving… (${validBulkCount})` : `Save ${validBulkCount} Valid Rows`}
              </button>
              <button type="button" onClick={() => { setShowBulk(false); setBulkRows([]) }}
                className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-[#2563FF]/10 dark:bg-blue-900/20 border border-[#2563FF]/30 rounded-xl">
          <span className="text-[13px] font-semibold text-black dark:text-white">{selected.size} selected</span>
          <button onClick={deleteSelected} disabled={deletingBulk}
            className="text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 px-3.5 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
            🗑 Delete selected
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">Clear</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">🧾</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-1">{items.length === 0 ? 'No BOQ items yet' : 'No items match'}</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">
            {items.length === 0 ? 'Add an item or import an Excel file to build the BOQ.' : 'Adjust the filters above.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {canEdit && (
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      title="Select all" className="w-4 h-4 rounded accent-[#2563FF] cursor-pointer" />
                  </th>
                )}
                {['ID','Description','Area','Building','Trade','Activity','Qty','Rate','Total',''].map((h, i) => (
                  <th key={i} className={`px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider ${i >= 6 && i <= 8 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {scopeGroups.map(group => {
                const isCollapsed = collapsed.has(group.scope)
                const ids = group.list.map(i => i.id)
                return (
                  <>
                    {/* Scope header */}
                    <tr key={`scope-${group.scope}`} className="bg-[#F9FAFB] dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-700 select-none">
                      {canEdit && (
                        <td className="px-3 py-2.5 w-8">
                          <input type="checkbox"
                            checked={ids.length > 0 && ids.every(id => selected.has(id))}
                            onChange={() => toggleScopeSel(ids)} title="Select scope"
                            className="w-4 h-4 rounded accent-[#2563FF] cursor-pointer" />
                        </td>
                      )}
                      <td colSpan={9} className="px-3 py-2.5 cursor-pointer" onClick={() => toggleCollapse(group.scope)}>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-[12px] font-bold text-black dark:text-white">
                            <span className="inline-block w-3 text-[#6B7280] dark:text-gray-400">{isCollapsed ? '▸' : '▾'}</span>
                            {group.scope}
                            <span className="text-[10px] font-normal text-[#6B7280] dark:text-gray-400">({group.list.length})</span>
                          </span>
                          <span className="text-[11px] font-semibold text-[#374151] dark:text-gray-300">{money(group.total)}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Item rows */}
                    {!isCollapsed && group.list.map(it => (
                      <tr key={it.id} className={`transition-colors ${selected.has(it.id) ? 'bg-[#2563FF]/5 dark:bg-blue-900/20' : 'hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50'}`}>
                        {canEdit && (
                          <td className="px-3 py-3 w-8">
                            <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleSel(it.id)}
                              className="w-4 h-4 rounded accent-[#2563FF] cursor-pointer" />
                          </td>
                        )}
                        <td className="px-3 py-3 font-semibold text-black dark:text-white whitespace-nowrap">{it.code}</td>
                        <td className="px-3 py-3 text-[#374151] dark:text-gray-300 max-w-[280px]">{it.description}</td>
                        <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{it.area || '—'}</td>
                        <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{it.building || '—'}</td>
                        <td className="px-3 py-3">
                          {it.trade
                            ? <span className="bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">{it.trade}</span>
                            : <span className="text-[#9CA3AF]">—</span>}
                        </td>
                        <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{it.activity || '—'}</td>
                        <td className="px-3 py-3 text-right text-[#374151] dark:text-gray-300 tabular-nums">{fmtN(it.qty, 2)}</td>
                        <td className="px-3 py-3 text-right text-[#374151] dark:text-gray-300 tabular-nums">{fmtN(it.rate, 2)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-black dark:text-white tabular-nums whitespace-nowrap">{money(it.totalPrice || 0)}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2 justify-end whitespace-nowrap">
                            {canEdit && (
                              <>
                                <button onClick={() => openEdit(it)} className="text-[11px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white">Edit</button>
                                <button onClick={() => deleteItem(it.id)} className="text-[11px] text-red-400 hover:text-red-600">Del</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                {canEdit && <td />}
                <td className="px-3 py-3 text-[11px] font-bold text-black dark:text-white uppercase tracking-wider text-left" colSpan={8}>
                  Grand Total ({displayed.length} items)
                </td>
                <td className="px-3 py-3 text-[12px] font-bold text-black dark:text-white text-right whitespace-nowrap">{money(grandTotal)}</td>
                <td />
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
