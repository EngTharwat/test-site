'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Segment, Zone, PIPE_MATERIALS, ACTIVITY_KEYS, fmtN } from '@/lib/types'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

// ── Bulk upload types ─────────────────────────────────────────────────────────
interface BulkRow {
  rowNum:     number
  zoneName:   string
  zoneId:     string | null
  lineNumber: string
  fromMH:     string
  toMH:       string
  diameter:   number
  length:     number
  material:   string
  startLat:   number | null
  startLng:   number | null
  endLat:     number | null
  endLng:     number | null
  error?:     string
}

const emptyForm = {
  zoneId: '', lineNumber: '', fromMH: '', toMH: '',
  diameter: '', length: '', material: 'uPVC',
  startLat: '', startLng: '', endLat: '', endLng: '',
}

export default function SegmentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.isAdmin ?? false
  const canEdit = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).segments === 'edit'
    : false)

  const [segments,    setSegments]    = useState<Segment[]>([])
  const [zones,       setZones]       = useState<Zone[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [showForm,    setShowForm]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [filterZone,  setFilterZone]  = useState('')
  const [editSegment, setEditSegment] = useState<Segment | null>(null)
  const [form, setForm] = useState(emptyForm)

  // Bulk upload state
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const [bulkRows,    setBulkRows]    = useState<BulkRow[]>([])
  const [showBulk,    setShowBulk]    = useState(false)
  const [bulkSaving,  setBulkSaving]  = useState(false)
  const [bulkResult,  setBulkResult]  = useState<{ ok: number; fail: number } | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [segs, zns] = await Promise.all([
        api.get(`/api/projects/${projectId}/segments`),
        api.get(`/api/projects/${projectId}/zones`),
      ])
      setSegments(segs)
      setZones(zns)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Zone label helper ─────────────────────────────────────────────────────
  const zoneLabel = (z: Zone) => z.type ? `${z.name} — ${z.type}` : z.name
  const zoneMap   = Object.fromEntries(zones.map(z => [z.id, z]))

  // ── Bulk upload helpers ───────────────────────────────────────────────────
  function buildZoneLookup() {
    const map = new Map<string, Zone>()
    zones.forEach(z => {
      map.set(zoneLabel(z).toLowerCase(), z)
      map.set(z.name.toLowerCase(), z)
    })
    return map
  }

  async function downloadTemplate() {
    const XLSX = (await import('xlsx')).default ?? await import('xlsx')
    const headers = ['Zone', 'Line No.', 'From MH', 'To MH', 'Diameter (mm)', 'Length (m)', 'Material',
                     'Start Lat', 'Start Long', 'End Lat', 'End Long']
    const example = zones.length > 0
      ? [zoneLabel(zones[0]), 'L-001', 'MH-01', 'MH-02', '300', '45.5', 'uPVC', '', '', '', '']
      : ['Zone A — Gravity',  'L-001', 'MH-01', 'MH-02', '300', '45.5', 'uPVC', '', '', '', '']

    const ws = XLSX.utils.aoa_to_sheet([headers, example])

    // Column widths
    ws['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
                   { wch: 14 }, { wch: 10 }, { wch: 10 },
                   { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]

    // Zones reference sheet
    const zonesWs = XLSX.utils.aoa_to_sheet([
      ['Zone (copy exact value into Zone column)'],
      ...zones.map(z => [zoneLabel(z)]),
    ])

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Segments')
    XLSX.utils.book_append_sheet(wb, zonesWs, 'Zones Reference')
    XLSX.writeFile(wb, 'pmboards-segments-template.xlsx')
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const XLSX = (await import('xlsx')).default ?? await import('xlsx')
    const lookup = buildZoneLookup()

    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target!.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]

      if (rows.length < 2) { setError('File has no data rows'); return }

      const [headerRow, ...dataRows] = rows
      const hdr = (i: number) => String(headerRow[i] ?? '').toLowerCase()

      // Find column indices by header name
      const col = {
        zone:     headerRow.findIndex((_: any, i: number) => /zone/i.test(String(headerRow[i]))),
        line:     headerRow.findIndex((_: any, i: number) => /line/i.test(String(headerRow[i]))),
        from:     headerRow.findIndex((_: any, i: number) => /from/i.test(String(headerRow[i]))),
        to:       headerRow.findIndex((_: any, i: number) => /to\b/i.test(String(headerRow[i]))),
        diameter: headerRow.findIndex((_: any, i: number) => /diam/i.test(String(headerRow[i]))),
        length:   headerRow.findIndex((_: any, i: number) => /length/i.test(String(headerRow[i]))),
        material: headerRow.findIndex((_: any, i: number) => /material/i.test(String(headerRow[i]))),
        sLat:     headerRow.findIndex((_: any, i: number) => /start.?lat/i.test(String(headerRow[i]))),
        sLng:     headerRow.findIndex((_: any, i: number) => /start.?l(o|ng)/i.test(String(headerRow[i]))),
        eLat:     headerRow.findIndex((_: any, i: number) => /end.?lat/i.test(String(headerRow[i]))),
        eLng:     headerRow.findIndex((_: any, i: number) => /end.?l(o|ng)/i.test(String(headerRow[i]))),
      }

      const parsed: BulkRow[] = dataRows
        .filter(row => row.some((c: any) => String(c).trim()))   // skip blank rows
        .map((row, idx) => {
          const zoneName = String(row[col.zone] ?? '').trim()
          const zone     = lookup.get(zoneName.toLowerCase())
          const length   = parseFloat(String(row[col.length] ?? '')) || 0
          const errors: string[] = []

          if (!zoneName)   errors.push('Zone is required')
          else if (!zone)  errors.push(`Zone "${zoneName}" not found`)
          if (length <= 0) errors.push('Length must be > 0')

          const mat = String(row[col.material] ?? 'uPVC').trim()

          return {
            rowNum:     idx + 2,
            zoneName,
            zoneId:     zone?.id ?? null,
            lineNumber: String(row[col.line]     ?? '').trim(),
            fromMH:     String(row[col.from]     ?? '').trim(),
            toMH:       String(row[col.to]       ?? '').trim(),
            diameter:   parseFloat(String(row[col.diameter] ?? '')) || 0,
            length,
            material:   PIPE_MATERIALS.includes(mat as any) ? mat : 'uPVC',
            startLat:   col.sLat >= 0 ? parseFloat(String(row[col.sLat])) || null : null,
            startLng:   col.sLng >= 0 ? parseFloat(String(row[col.sLng])) || null : null,
            endLat:     col.eLat >= 0 ? parseFloat(String(row[col.eLat])) || null : null,
            endLng:     col.eLng >= 0 ? parseFloat(String(row[col.eLng])) || null : null,
            error:      errors.join('; ') || undefined,
          }
        })

      setBulkRows(parsed)
      setShowBulk(true)
      setBulkResult(null)
    }
    reader.readAsBinaryString(file)
  }

  async function confirmBulkUpload() {
    const valid = bulkRows.filter(r => !r.error)
    if (!valid.length) return
    setBulkSaving(true)
    let ok = 0, fail = 0

    for (const row of valid) {
      const defaultAct = (qty: number) => ({ plannedQty: qty, actualQty: 0, pct: 0, status: 'not_started' })
      try {
        const seg = await api.post(`/api/projects/${projectId}/segments`, {
          zoneId:     row.zoneId!,
          lineNumber: row.lineNumber,
          fromMH:     row.fromMH,
          toMH:       row.toMH,
          diameter:   row.diameter,
          length:     row.length,
          material:   row.material,
          startLat:   row.startLat,
          startLng:   row.startLng,
          endLat:     row.endLat,
          endLng:     row.endLng,
          excavation:  defaultAct(row.length),
          piping:      defaultAct(row.length),
          backfilling: defaultAct(row.length),
          basecourse:  defaultAct(row.length),
          asphalt:     defaultAct(row.length),
          overallPct: 0,
          status: 'not_started',
        })
        setSegments(prev => [seg, ...prev])
        ok++
      } catch { fail++ }
    }

    setBulkResult({ ok, fail })
    setBulkSaving(false)
    if (fail === 0) { setTimeout(() => { setShowBulk(false); setBulkRows([]) }, 1500) }
  }

  // ── Manual form ───────────────────────────────────────────────────────────
  function openEdit(seg: Segment) {
    setEditSegment(seg)
    setForm({
      zoneId:     seg.zoneId,
      lineNumber: seg.lineNumber,
      fromMH:     seg.fromMH,
      toMH:       seg.toMH,
      diameter:   String(seg.diameter),
      length:     String(seg.length),
      material:   seg.material,
      startLat:   seg.startLat != null ? String(seg.startLat) : '',
      startLng:   seg.startLng != null ? String(seg.startLng) : '',
      endLat:     seg.endLat   != null ? String(seg.endLat)   : '',
      endLng:     seg.endLng   != null ? String(seg.endLng)   : '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteSeg(segId: string) {
    if (!confirm('Delete this segment? This cannot be undone.')) return
    try {
      await api.delete(`/api/projects/${projectId}/segments/${segId}`)
      setSegments(prev => prev.filter(s => s.id !== segId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete segment')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.zoneId) { setError('Please select a zone'); return }
    setSaving(true); setError('')
    const len = Number(form.length) || 0
    const body = {
      zoneId:     form.zoneId,
      lineNumber: form.lineNumber.trim(),
      fromMH:     form.fromMH.trim(),
      toMH:       form.toMH.trim(),
      diameter:   Number(form.diameter) || 0,
      length:     len,
      material:   form.material,
      startLat:   form.startLat ? Number(form.startLat) : null,
      startLng:   form.startLng ? Number(form.startLng) : null,
      endLat:     form.endLat   ? Number(form.endLat)   : null,
      endLng:     form.endLng   ? Number(form.endLng)   : null,
    }
    try {
      if (editSegment) {
        const updated = await api.patch(`/api/projects/${projectId}/segments/${editSegment.id}`, body)
        setSegments(prev => prev.map(s => s.id === editSegment.id ? updated : s))
      } else {
        const defaultAct = (qty: number) => ({ plannedQty: qty, actualQty: 0, pct: 0, status: 'not_started' })
        const seg = await api.post(`/api/projects/${projectId}/segments`, {
          ...body,
          excavation:  defaultAct(len),
          piping:      defaultAct(len),
          backfilling: defaultAct(len),
          basecourse:  defaultAct(len),
          asphalt:     defaultAct(len),
          overallPct:  0,
          status:      'not_started',
        })
        setSegments(prev => [seg, ...prev])
      }
      setForm(emptyForm); setShowForm(false); setEditSegment(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save segment')
    } finally {
      setSaving(false)
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const displayed = filterZone ? segments.filter(s => s.zoneId === filterZone) : segments
  const totalLen  = displayed.reduce((s, seg) => s + (seg.length || 0), 0)
  const validBulkCount = bulkRows.filter(r => !r.error).length

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
            ← Overview
          </button>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Network Segments</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">Individual pipe segments with engineering data</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={downloadTemplate}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="Download Excel template"
            >
              ↓ Template
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="border border-[#2563FF] text-[#2563FF] text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              title="Bulk upload from Excel"
            >
              ↑ Bulk Upload
            </button>
            <button
              onClick={() => { setForm(emptyForm); setEditSegment(null); setShowForm(v => !v) }}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors"
            >
              + Add Segment
            </button>
          </div>
        )}
      </div>

      {/* Filter + stats */}
      <div className="flex items-center gap-4 mb-6">
        <select
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500"
          value={filterZone} onChange={e => setFilterZone(e.target.value)}
        >
          <option value="">All Zones ({segments.length})</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>
              {zoneLabel(z)} ({segments.filter(s => s.zoneId === z.id).length})
            </option>
          ))}
        </select>
        <span className="text-[12px] text-[#6B7280] dark:text-gray-400">
          {displayed.length} segments · {fmtN(totalLen, 1)} m total
        </span>
      </div>

      {/* Manual form */}
      {showForm && canEdit && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">
            {editSegment ? 'Edit Segment' : 'New Pipe Segment'}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2 md:col-span-4">
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Zone *</label>
              <select className={inputCls} value={form.zoneId} onChange={set('zoneId')} required>
                <option value="">— Select Zone —</option>
                {zones.map(z => (
                  <option key={z.id} value={z.id}>{zoneLabel(z)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Line No.</label>
              <input className={inputCls} value={form.lineNumber} onChange={set('lineNumber')} placeholder="L-001" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">From MH</label>
              <input className={inputCls} value={form.fromMH} onChange={set('fromMH')} placeholder="MH-01" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">To MH</label>
              <input className={inputCls} value={form.toMH} onChange={set('toMH')} placeholder="MH-02" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Diameter (mm)</label>
              <input className={inputCls} type="number" min="0" value={form.diameter} onChange={set('diameter')} placeholder="300" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Length (m) *</label>
              <input className={inputCls} type="number" min="0" step="0.01" value={form.length} onChange={set('length')} placeholder="45.5" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Material</label>
              <select className={inputCls} value={form.material} onChange={set('material')}>
                {PIPE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Start Lat</label>
              <input className={inputCls} type="number" step="any" value={form.startLat} onChange={set('startLat')} placeholder="24.123456" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Start Lng</label>
              <input className={inputCls} type="number" step="any" value={form.startLng} onChange={set('startLng')} placeholder="46.789012" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">End Lat</label>
              <input className={inputCls} type="number" step="any" value={form.endLat} onChange={set('endLat')} placeholder="24.123789" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">End Lng</label>
              <input className={inputCls} type="number" step="any" value={form.endLng} onChange={set('endLng')} placeholder="46.789345" />
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editSegment ? 'Update Segment' : 'Add Segment'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditSegment(null); setForm(emptyForm) }}
              className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {/* Bulk upload preview modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-5xl mb-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-bold text-black dark:text-white">Bulk Upload Preview</h2>
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-0.5">
                  {validBulkCount} valid · {bulkRows.length - validBulkCount} with errors
                </p>
              </div>
              <button onClick={() => { setShowBulk(false); setBulkRows([]); setBulkResult(null) }}
                className="text-[#6B7280] hover:text-black dark:hover:text-white text-xl">×</button>
            </div>

            {bulkResult ? (
              <div className="px-6 py-8 text-center">
                <div className="text-3xl mb-3">{bulkResult.fail === 0 ? '✅' : '⚠️'}</div>
                <p className="text-[15px] font-bold text-black dark:text-white mb-1">
                  Upload complete
                </p>
                <p className="text-sm text-[#6B7280] dark:text-gray-400">
                  {bulkResult.ok} saved · {bulkResult.fail} failed
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-[#F3F4F6] dark:bg-gray-800">
                      <tr>
                        {['Row','Zone','Line','From','To','Ø mm','Length m','Material','Status'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {bulkRows.map(row => (
                        <tr key={row.rowNum} className={row.error ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                          <td className="px-3 py-2 text-[#6B7280]">{row.rowNum}</td>
                          <td className="px-3 py-2 font-medium text-black dark:text-white max-w-[160px] truncate">{row.zoneName || '—'}</td>
                          <td className="px-3 py-2">{row.lineNumber || '—'}</td>
                          <td className="px-3 py-2">{row.fromMH || '—'}</td>
                          <td className="px-3 py-2">{row.toMH || '—'}</td>
                          <td className="px-3 py-2 text-right">{row.diameter || '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtN(row.length, 1)}</td>
                          <td className="px-3 py-2">{row.material}</td>
                          <td className="px-3 py-2">
                            {row.error
                              ? <span className="text-red-500 text-[10px]">{row.error}</span>
                              : <span className="text-green-600 font-semibold text-[10px]">✓ Ready</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={confirmBulkUpload}
                    disabled={bulkSaving || validBulkCount === 0}
                    className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
                  >
                    {bulkSaving ? `Saving… (${validBulkCount} rows)` : `Save ${validBulkCount} Valid Rows`}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowBulk(false); setBulkRows([]); setBulkResult(null) }}
                    className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Segments table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">🔧</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-1">No segments yet</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">
            Add segments manually or use Bulk Upload with the Excel template.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {['Zone','Line','MH From → To','Ø (mm)','Length (m)','Material',
                  ...ACTIVITY_KEYS.map(a => a.label.slice(0,4)), 'Overall', ''].map((h, i) => (
                  <th key={i} className={`px-4 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider ${i >= 6 && i <= 10 ? 'text-center' : i > 10 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {displayed.map(seg => {
                const zone = zoneMap[seg.zoneId]
                return (
                  <tr key={seg.id} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-[#374151] dark:text-gray-300">
                      {zone ? (
                        <span>
                          {zone.name}
                          {zone.type && <span className="ml-1 text-[9px] text-[#6B7280] dark:text-gray-500">({zone.type})</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-black dark:text-white">{seg.lineNumber || '—'}</td>
                    <td className="px-4 py-3 text-[#374151] dark:text-gray-300">{seg.fromMH} → {seg.toMH}</td>
                    <td className="px-4 py-3 text-right text-[#374151] dark:text-gray-300">{fmtN(seg.diameter)}</td>
                    <td className="px-4 py-3 text-right font-medium text-black dark:text-white">{fmtN(seg.length, 1)}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">{seg.material}</span>
                    </td>
                    {ACTIVITY_KEYS.map(a => {
                      const pct = (seg as any)[a.key]?.pct || 0
                      return (
                        <td key={a.key} className="px-2 py-3">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="h-1 w-10 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(pct,100)}%`, background: a.color }} />
                            </div>
                            <span className="text-[9px] text-[#6B7280] dark:text-gray-400">{pct}%</span>
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-right font-bold text-black dark:text-white">{seg.overallPct || 0}%</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2.5 justify-end whitespace-nowrap">
                        {canEdit && (
                          <>
                            <button onClick={() => openEdit(seg)} className="text-[11px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white">Edit</button>
                            <button onClick={() => deleteSeg(seg.id)} className="text-[11px] text-red-400 hover:text-red-600">Del</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                <td colSpan={4} className="px-4 py-3 text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">
                  Total ({displayed.length} segments)
                </td>
                <td className="px-4 py-3 text-right text-[12px] font-bold text-black dark:text-white">{fmtN(totalLen, 1)}</td>
                <td colSpan={8} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
