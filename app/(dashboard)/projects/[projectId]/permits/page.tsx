'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import {
  Permit, PERMIT_SHEET_COLUMNS,
  PERMIT_STATUS_SUGGESTIONS, EXCAVATION_STATUS_SUGGESTIONS,
  permitStatusKind, PERMIT_KIND_COLORS,
  permitExpiryState, daysRemaining,
} from '@/lib/types'
import { UploadProgressModal, type UploadState, initialUpload } from '@/lib/upload-progress'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const filterCls = 'border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500'

const emptyForm = {
  permitNo: '', projectName: '', workOrderNo: '', serviceAuthority: '',
  amanah: '', municipality: '', district: '', contractor: '', consultant: '',
  startDate: '', permitType: '', status: '', excavation: '', expiryDate: '',
}

export default function PermitsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.isAdmin ?? false
  const canEdit = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).permits === 'edit'
    : false)

  const [permits,  setPermits]  = useState<Permit[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  // Filters
  const [fStatus,   setFStatus]   = useState('')
  const [fExcav,    setFExcav]    = useState('')
  const [fDistrict, setFDistrict] = useState('')
  const [fExpiry,   setFExpiry]   = useState('')
  const [search,    setSearch]    = useState('')

  // Excel
  const fileRef = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<UploadState>(initialUpload)

  const fetchAll = useCallback(async () => {
    try {
      const data = await api.get(`/api/projects/${projectId}/permits`)
      setPermits(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load permits')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const districts   = [...new Set(permits.map(p => p.district).filter(Boolean))].sort()
  const statusVals  = [...new Set(permits.map(p => p.status).filter(Boolean))].sort()
  const excavVals   = [...new Set(permits.map(p => p.excavation).filter(Boolean))].sort()

  const displayed = permits.filter(p => {
    if (fStatus   && p.status !== fStatus)             return false
    if (fExcav    && p.excavation !== fExcav)          return false
    if (fDistrict && p.district !== fDistrict)         return false
    if (fExpiry   && permitExpiryState(p.expiryDate) !== fExpiry) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${p.permitNo} ${p.projectName} ${p.workOrderNo} ${p.contractor} ${p.consultant}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // KPIs
  const kpis = {
    total:    permits.length,
    active:   permits.filter(p => permitStatusKind(p.status) === 'active').length,
    expiring: permits.filter(p => permitExpiryState(p.expiryDate) === 'soon').length,
    expired:  permits.filter(p => permitExpiryState(p.expiryDate) === 'expired').length,
  }

  // ── Form ────────────────────────────────────────────────────────────────
  function openEdit(p: Permit) {
    setEditId(p.id)
    setForm({
      permitNo: p.permitNo ?? '', projectName: p.projectName ?? '', workOrderNo: p.workOrderNo ?? '',
      serviceAuthority: p.serviceAuthority ?? '', amanah: p.amanah ?? '', municipality: p.municipality ?? '',
      district: p.district ?? '', contractor: p.contractor ?? '', consultant: p.consultant ?? '',
      startDate: p.startDate ?? '', permitType: p.permitType ?? '',
      status: p.status ?? 'pending', excavation: p.excavation ?? 'not_started', expiryDate: p.expiryDate ?? '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.permitNo.trim()) { setError('Permit number is required'); return }
    setSaving(true); setError('')
    try {
      if (editId) {
        const updated = await api.patch(`/api/projects/${projectId}/permits/${editId}`, form)
        setPermits(prev => prev.map(p => p.id === editId ? updated : p))
      } else {
        const created = await api.post(`/api/projects/${projectId}/permits`, form)
        setPermits(prev => [...prev, created])
      }
      setForm(emptyForm); setShowForm(false); setEditId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save permit')
    } finally {
      setSaving(false)
    }
  }

  async function deletePermit(id: string) {
    if (!confirm('Delete this permit?')) return
    try {
      await api.delete(`/api/projects/${projectId}/permits/${id}`)
      setPermits(prev => prev.filter(p => p.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // ── Excel — exact Balady (منصة بلدي) format: Arabic headers + order ────────
  const FIELD_KEYS = PERMIT_SHEET_COLUMNS.map(c => c.key as keyof Permit)
  const HEADERS    = PERMIT_SHEET_COLUMNS.map(c => c.ar)

  async function exportXlsx(blankTemplate = false) {
    const XLSX = await import('xlsx')
    const rows = blankTemplate
      ? [] as any[][]   // headers only — paste the Balady download underneath
      : displayed.map(p => FIELD_KEYS.map(k => (p as any)[k] ?? ''))
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows])
    ws['!cols']    = HEADERS.map(() => ({ wch: 18 }))
    ws['!rtl']     = true   // right-to-left sheet to match Balady
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'تصاريح')
    XLSX.writeFile(wb, blankTemplate
      ? 'pmboards-permits-template.xlsx'
      : `pmboards-permits-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const XLSX = await import('xlsx')
    // Match existing permits by Permit No. (رقم التصريح) — the Balady unique key
    const byPermitNo = new Map(permits.filter(p => p.permitNo).map(p => [p.permitNo.trim(), p]))

    const norm = (s: any) => String(s ?? '').trim().replace(/\s+/g, ' ')

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const wb   = XLSX.read(ev.target!.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]
      if (grid.length < 2) { setError('الملف لا يحتوي على بيانات / File has no data rows'); return }

      // Find the header row (Balady files sometimes have a title row first):
      // pick the first row that contains رقم التصريح.
      let headerRowIdx = grid.findIndex(r => r.some((c: any) => norm(c) === 'رقم التصريح'))
      if (headerRowIdx < 0) headerRowIdx = 0
      const hdr = grid[headerRowIdx]
      const dataRows = grid.slice(headerRowIdx + 1)

      // Map each column index to a Permit field by matching the Arabic header.
      const idx: Partial<Record<keyof Permit, number>> = {}
      PERMIT_SHEET_COLUMNS.forEach(c => {
        const i = hdr.findIndex((_: any, j: number) => norm(hdr[j]) === c.ar)
        if (i >= 0) idx[c.key] = i
      })
      if (idx.permitNo == null) {
        setError('تعذّر إيجاد عمود "رقم التصريح" — تأكد أن الملف من منصة بلدي')
        return
      }

      const cell = (row: any[], key: keyof Permit) => idx[key] != null ? norm(row[idx[key]!]) : ''
      const valid = dataRows.filter(r => r.some((c: any) => norm(c)) && cell(r, 'permitNo'))
      if (!valid.length) { setError('لا توجد صفوف تحتوي على رقم تصريح'); return }

      setUpload({ open: true, title: 'استيراد التصاريح', total: valid.length, done: 0, ok: 0, fail: 0, finished: false })
      let ok = 0, fail = 0
      for (const row of valid) {
        const payload: Record<string, string> = {}
        FIELD_KEYS.forEach(k => { payload[k] = cell(row, k) })
        const existing = byPermitNo.get(payload.permitNo)
        try {
          if (existing) {
            const updated = await api.patch(`/api/projects/${projectId}/permits/${existing.id}`, payload)
            setPermits(prev => prev.map(p => p.id === existing.id ? updated : p))
          } else {
            const created = await api.post(`/api/projects/${projectId}/permits`, payload)
            setPermits(prev => [...prev, created])
            byPermitNo.set(payload.permitNo, created)
          }
          ok++
        } catch { fail++ }
        setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
      }
      setUpload(u => ({ ...u, finished: true }))
    }
    reader.readAsBinaryString(file)
  }

  // ── Chips ───────────────────────────────────────────────────────────────
  // Show the raw Balady text, coloured by classified kind.
  function StatusChip({ s }: { s: string }) {
    if (!s) return <span className="text-[#9CA3AF]">—</span>
    const c = PERMIT_KIND_COLORS[permitStatusKind(s)]
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{s}</span>
  }
  function ExpiryChip({ date }: { date: string }) {
    const st = permitExpiryState(date)
    if (st === 'none') return <span className="text-[#9CA3AF]">—</span>
    const d = daysRemaining(date)
    const map = {
      expired: { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',     txt: `Expired ${Math.abs(d)}d` },
      soon:    { cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', txt: `${d}d left` },
      valid:   { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', txt: `${d}d left` },
    } as const
    const m = map[st]
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="text-[11px] text-[#374151] dark:text-gray-300">{date}</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${m.cls}`}>{m.txt}</span>
      </span>
    )
  }

  const hasFilter = !!(fStatus || fExcav || fDistrict || fExpiry || search)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
            ← Overview
          </button>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Work Permits</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">Infrastructure / excavation permits and their status</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => exportXlsx(true)}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">↓ Template</button>
            <button onClick={() => exportXlsx(false)} disabled={permits.length === 0}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">⬇ Export</button>
            <button onClick={() => fileRef.current?.click()}
              className="border border-[#2563FF] text-[#2563FF] text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">↑ Import</button>
            <button onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(v => !v) }}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">+ Add Permit</button>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Permits', value: kpis.total,    accent: undefined as string | undefined },
          { label: 'Active',        value: kpis.active,   accent: '#22c55e' },
          { label: 'Expiring ≤30d', value: kpis.expiring, accent: kpis.expiring ? '#f97316' : undefined },
          { label: 'Expired',       value: kpis.expired,  accent: kpis.expired ? '#ef4444' : undefined },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-800">
            <div className="text-[10px] font-semibold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">{k.label}</div>
            <div className="text-2xl font-bold tracking-[-0.5px] dark:text-white" style={{ color: k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Add / edit form */}
      {showForm && canEdit && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">
            {editId ? 'Edit Permit' : 'New Permit'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { k: 'permitNo',         l: 'Permit No. *',       ph: 'TR-001' },
              { k: 'workOrderNo',      l: 'Work Order No.',     ph: 'WO-001' },
              { k: 'projectName',      l: 'Project Name',       ph: 'Project name' },
              { k: 'serviceAuthority', l: 'Service Authority',  ph: 'NWC' },
              { k: 'amanah',           l: 'Amanah',             ph: 'Al-Ahsa' },
              { k: 'municipality',     l: 'Municipality',       ph: 'Al-Hofuf' },
              { k: 'district',         l: 'District',           ph: 'Al-Naseem' },
              { k: 'contractor',       l: 'Main Contractor',    ph: '' },
              { k: 'consultant',       l: 'Main Consultant',    ph: '' },
              { k: 'permitType',       l: 'Permit Type',        ph: 'New / Renewal' },
            ].map(f => (
              <div key={f.k}>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">{f.l}</label>
                <input className={inputCls} value={(form as any)[f.k]} onChange={set(f.k)} placeholder={f.ph}
                  required={f.k === 'permitNo'} />
              </div>
            ))}
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Start Date</label>
              <input className={inputCls} type="date" value={form.startDate} onChange={set('startDate')} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Expiry Date</label>
              <input className={inputCls} type="date" value={form.expiryDate} onChange={set('expiryDate')} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">حالة التصريح · Permit Status</label>
              <input className={inputCls} list="permit-status-list" value={form.status} onChange={set('status')} placeholder="ساري" />
              <datalist id="permit-status-list">
                {PERMIT_STATUS_SUGGESTIONS.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">حالة الحفرية · Excavation Status</label>
              <input className={inputCls} list="excav-status-list" value={form.excavation} onChange={set('excavation')} placeholder="قائمة" />
              <datalist id="excav-status-list">
                {EXCAVATION_STATUS_SUGGESTIONS.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editId ? 'Update Permit' : 'Add Permit'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm) }}
              className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <input className={filterCls} style={{ width: 160 }} placeholder="Search permit / project…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className={filterCls} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {statusVals.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={filterCls} value={fExcav} onChange={e => setFExcav(e.target.value)}>
          <option value="">All Excavation</option>
          {excavVals.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={filterCls} value={fExpiry} onChange={e => setFExpiry(e.target.value)}>
          <option value="">All Expiry</option>
          <option value="expired">Expired</option>
          <option value="soon">Expiring ≤30d</option>
          <option value="valid">Valid</option>
        </select>
        {districts.length > 0 && (
          <select className={filterCls} value={fDistrict} onChange={e => setFDistrict(e.target.value)}>
            <option value="">All Districts</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <span className="ml-auto text-[12px] text-[#6B7280] dark:text-gray-400">{displayed.length} permits</span>
        {hasFilter && (
          <button onClick={() => { setFStatus(''); setFExcav(''); setFDistrict(''); setFExpiry(''); setSearch('') }}
            className="text-[11px] text-red-400 hover:text-red-600">✕ Clear</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">📄</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-1">No permits {permits.length ? 'match' : 'yet'}</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">Add permits manually or import the Excel sheet.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px] text-center whitespace-nowrap">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {['Permit No.','Project','Work Order','Service','Municipality','District','Contractor','Start','Type','Status','Excavation','Expiry', ''].map((h, i) => (
                  <th key={i} className="px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {displayed.map(p => (
                <tr key={p.id} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-3 font-semibold text-black dark:text-white">{p.permitNo || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300 max-w-[180px] truncate" title={p.projectName}>{p.projectName || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.workOrderNo || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.serviceAuthority || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.municipality || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.district || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300 max-w-[150px] truncate" title={p.contractor}>{p.contractor || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.startDate || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.permitType || '—'}</td>
                  <td className="px-3 py-3"><StatusChip s={p.status} /></td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.excavation || '—'}</td>
                  <td className="px-3 py-3 text-right"><ExpiryChip date={p.expiryDate} /></td>
                  <td className="px-3 py-3">
                    {canEdit && (
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => openEdit(p)} className="text-[11px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white">Edit</button>
                        <button onClick={() => deletePermit(p.id)} className="text-[11px] text-red-400 hover:text-red-600">Del</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UploadProgressModal state={upload} onClose={() => { setUpload(initialUpload) }} />
    </div>
  )
}
