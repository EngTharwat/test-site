'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Segment, Zone, PIPE_MATERIALS, ACTIVITY_KEYS, fmtN } from '@/lib/types'
import { UploadProgressModal, type UploadState, initialUpload } from '@/lib/upload-progress'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const filterCls = 'border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500'

// ── Bulk row type ─────────────────────────────────────────────────────────────
interface BulkRow {
  rowNum: number; id: string; zoneName: string; zoneId: string | null
  lineNumber: string; fromMH: string; toMH: string
  diameter: number; length: number; material: string
  basecourseThickness: number; asphaltThickness: number
  startLat: number | null; startLng: number | null
  endLat: number | null; endLng: number | null
  isUpdate: boolean   // true when the ID matches an existing segment
  error?: string
}

const emptyForm = {
  zoneId: '', lineNumber: '', fromMH: '', toMH: '',
  diameter: '', length: '', material: 'uPVC',
  basecourseThickness: '0', asphaltThickness: '0',
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
  const [editSegment, setEditSegment] = useState<Segment | null>(null)
  const [form, setForm] = useState(emptyForm)

  // Filters
  const [fZone,     setFZone]     = useState('')
  const [fType,     setFType]     = useState('')
  const [fLine,     setFLine]     = useState('')
  const [fDia,      setFDia]      = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [fSurface,  setFSurface]  = useState('')

  // Bulk upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [bulkRows,   setBulkRows]   = useState<BulkRow[]>([])
  const [showBulk,   setShowBulk]   = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ ok: number; fail: number } | null>(null)
  const [upload,     setUpload]     = useState<UploadState>(initialUpload)

  // Row selection (by segment id) + bulk delete
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [deletingBulk, setDeletingBulk] = useState(false)

  // Collapsed areas (by zone name)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapse = (name: string) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })

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

  // ── Derived helpers ───────────────────────────────────────────────────────
  const zoneMap   = Object.fromEntries(zones.map(z => [z.id, z]))
  const zoneLabel = (z: Zone) => z.type ? `${z.name} — ${z.type}` : z.name
  // Only linear scopes can hold segments; point facilities are excluded.
  const linearZones     = zones.filter(z => z.linear !== false)
  const uniqueTypes     = [...new Set(zones.map(z => z.type).filter(Boolean))]
  const uniqueDias      = [...new Set(segments.map(s => s.diameter).filter(Boolean))].sort((a, b) => a - b)
  const uniqueZoneNames = [...new Set(zones.map(z => z.name).filter(Boolean))].sort()
  const uniqueMaterials = [...new Set(segments.map(s => s.material).filter(Boolean))].sort()

  // ── Apply all filters ─────────────────────────────────────────────────────
  const displayed = segments.filter(seg => {
    const zone = zoneMap[seg.zoneId]
    if (fZone     && zone?.name   !== fZone)                         return false
    if (fType     && zone?.type   !== fType)                         return false
    if (fLine     && !seg.lineNumber?.toLowerCase().includes(fLine.toLowerCase())) return false
    if (fDia      && String(seg.diameter) !== fDia)                  return false
    if (fMaterial && seg.material !== fMaterial)                     return false
    if (fSurface  && (seg.surfaceType ?? 'dirt') !== fSurface)       return false
    return true
  })
  const totalLen = displayed.reduce((s, seg) => s + (seg.length || 0), 0)

  // ── Group by area (zone name); sort lines ascending within each area ────────
  const lineSort = (a: Segment, b: Segment) =>
    (a.lineNumber ?? '').localeCompare(b.lineNumber ?? '', undefined, { numeric: true, sensitivity: 'base' })

  const areaGroups = (() => {
    const map = new Map<string, Segment[]>()
    displayed.forEach(seg => {
      const name = zoneMap[seg.zoneId]?.name ?? '—'
      ;(map.get(name) ?? map.set(name, []).get(name)!).push(seg)
    })
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([name, segs]) => ({
        name,
        segs: [...segs].sort(lineSort),
        length: segs.reduce((s, x) => s + (x.length || 0), 0),
      }))
  })()

  // ── Surface type badge ────────────────────────────────────────────────────
  const surfaceBadge = (seg: Segment) => {
    const type = seg.surfaceType ?? ((seg.asphaltThickness ?? 0) > 0 ? 'asphalt' : 'dirt')
    return type === 'asphalt'
      ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900">Asphalt</span>
      : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Dirt</span>
  }

  // ── Activity dot ──────────────────────────────────────────────────────────
  const activityDot = (seg: Segment, key: string, color: string) => {
    const done = ((seg as any)[key]?.pct ?? 0) >= 100
    return (
      <span
        className="inline-block w-3.5 h-3.5 rounded-full border-2 transition-colors"
        style={{
          background:   done ? color : 'transparent',
          borderColor:  color,
          opacity:      done ? 1 : 0.4,
        }}
      />
    )
  }

  // ── Bulk upload ───────────────────────────────────────────────────────────
  function buildZoneLookup() {
    const map = new Map<string, Zone>()
    linearZones.forEach(z => {
      map.set(zoneLabel(z).toLowerCase(), z)
      map.set(z.name.toLowerCase(), z)
    })
    return map
  }

  // Column headers shared by the template and the export
  const SEG_HEADERS = ['ID','Zone','Line No.','From MH','To MH','Diameter (mm)','Length (m)','Material',
                       'Basecoarse Thickness','Asphalt Thickness','Start Lat','Start Long','End Lat','End Long']
  const SEG_COLW = [{wch:24},{wch:28},{wch:10},{wch:10},{wch:10},{wch:14},{wch:10},{wch:10},{wch:18},{wch:16},{wch:12},{wch:12},{wch:12},{wch:12}]

  function appendReferenceSheets(XLSX: any, wb: any) {
    const zonesWs = XLSX.utils.aoa_to_sheet([['Zone (copy exact value into Zone column)'], ...linearZones.map(z => [zoneLabel(z)])])
    zonesWs['!cols'] = [{ wch: 40 }]
    XLSX.utils.book_append_sheet(wb, zonesWs, 'Zones Reference')
    const matWs = XLSX.utils.aoa_to_sheet([['Material (copy exact value into Material column)'], ...PIPE_MATERIALS.map(m => [m])])
    matWs['!cols'] = [{ wch: 40 }]
    XLSX.utils.book_append_sheet(wb, matWs, 'Material Reference')
  }

  // Blank template — leave ID empty for new rows
  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const example = zones.length > 0
      ? ['', zoneLabel(zones[0]),'L-001','MH-01','MH-02','300','45.5','uPVC','0','0','','','','']
      : ['', 'Zone A — Gravity','L-001','MH-01','MH-02','300','45.5','uPVC','0','0','','','','']
    const ws = XLSX.utils.aoa_to_sheet([SEG_HEADERS, example])
    ws['!cols'] = SEG_COLW
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Segments')
    appendReferenceSheets(XLSX, wb)
    XLSX.writeFile(wb, 'pmboards-segments-template.xlsx')
  }

  // Export existing segments (with their IDs) so they can be edited & re-imported
  async function exportSegments() {
    const XLSX = await import('xlsx')
    const rows = displayed.map(s => {
      const z = zoneMap[s.zoneId]
      return [
        s.id,
        z ? zoneLabel(z) : '',
        s.lineNumber ?? '', s.fromMH ?? '', s.toMH ?? '',
        s.diameter ?? 0, s.length ?? 0, s.material ?? 'uPVC',
        s.basecourseThickness ?? 0, s.asphaltThickness ?? 0,
        s.startLat ?? '', s.startLng ?? '', s.endLat ?? '', s.endLng ?? '',
      ]
    })
    const ws = XLSX.utils.aoa_to_sheet([SEG_HEADERS, ...rows])
    ws['!cols'] = SEG_COLW
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Segments')
    appendReferenceSheets(XLSX, wb)
    XLSX.writeFile(wb, `pmboards-segments-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const XLSX = await import('xlsx')
    const lookup = buildZoneLookup()

    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target!.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]
      if (rows.length < 2) { setError('File has no data rows'); return }

      const [headerRow, ...dataRows] = rows
      const col = {
        id:       headerRow.findIndex((_: any, i: number) => /\bid\b/i.test(String(headerRow[i]))),
        zone:     headerRow.findIndex((_: any, i: number) => /zone/i.test(String(headerRow[i]))),
        line:     headerRow.findIndex((_: any, i: number) => /line/i.test(String(headerRow[i]))),
        from:     headerRow.findIndex((_: any, i: number) => /from/i.test(String(headerRow[i]))),
        to:       headerRow.findIndex((_: any, i: number) => /\bto\b/i.test(String(headerRow[i]))),
        diameter: headerRow.findIndex((_: any, i: number) => /diam/i.test(String(headerRow[i]))),
        length:   headerRow.findIndex((_: any, i: number) => /length/i.test(String(headerRow[i]))),
        material: headerRow.findIndex((_: any, i: number) => /material/i.test(String(headerRow[i]))),
        bcThk:    headerRow.findIndex((_: any, i: number) => /base ?co?a?rse/i.test(String(headerRow[i]))),
        aspThk:   headerRow.findIndex((_: any, i: number) => /asphalt.*thick/i.test(String(headerRow[i]))),
        sLat:     headerRow.findIndex((_: any, i: number) => /start.?lat/i.test(String(headerRow[i]))),
        sLng:     headerRow.findIndex((_: any, i: number) => /start.?l(o|ng)/i.test(String(headerRow[i]))),
        eLat:     headerRow.findIndex((_: any, i: number) => /end.?lat/i.test(String(headerRow[i]))),
        eLng:     headerRow.findIndex((_: any, i: number) => /end.?l(o|ng)/i.test(String(headerRow[i]))),
      }
      const existingIds = new Set(segments.map(s => s.id))

      const num = (row: any[], i: number) => i >= 0 && String(row[i]).trim() ? parseFloat(String(row[i])) || null : null

      const parsed: BulkRow[] = dataRows
        .filter(row => row.some((c: any) => String(c).trim()))
        .map((row, idx) => {
          const id       = col.id >= 0 ? String(row[col.id] ?? '').trim() : ''
          const zoneName = String(row[col.zone] ?? '').trim()
          const zone     = lookup.get(zoneName.toLowerCase())
          const length   = parseFloat(String(row[col.length] ?? '')) || 0
          const isUpdate = !!id && existingIds.has(id)
          const errors: string[] = []
          if (id && !existingIds.has(id)) errors.push(`ID "${id}" not found`)
          if (!zoneName)   errors.push('Zone required')
          else if (!zone)  errors.push(`Zone "${zoneName}" not found`)
          if (length <= 0) errors.push('Length must be > 0')
          const mat = String(row[col.material] ?? 'uPVC').trim()
          return {
            rowNum:     idx + 2,
            id,
            zoneName,
            zoneId:     zone?.id ?? null,
            lineNumber: String(row[col.line]     ?? '').trim(),
            fromMH:     String(row[col.from]     ?? '').trim(),
            toMH:       String(row[col.to]       ?? '').trim(),
            diameter:   parseFloat(String(row[col.diameter] ?? '')) || 0,
            length,
            material:   PIPE_MATERIALS.includes(mat as any) ? mat : 'uPVC',
            basecourseThickness: num(row, col.bcThk)  ?? 0,
            asphaltThickness:    num(row, col.aspThk) ?? 0,
            startLat:   num(row, col.sLat),
            startLng:   num(row, col.sLng),
            endLat:     num(row, col.eLat),
            endLng:     num(row, col.eLng),
            isUpdate,
            error:      errors.join('; ') || undefined,
          }
        })

      setBulkRows(parsed); setShowBulk(true); setBulkResult(null)
    }
    reader.readAsBinaryString(file)
  }

  async function confirmBulkUpload() {
    const valid = bulkRows.filter(r => !r.error)
    if (!valid.length) return
    setBulkSaving(true)
    setShowBulk(false)
    setUpload({ open: true, title: 'Uploading segments', total: valid.length, done: 0, ok: 0, fail: 0, finished: false })
    let ok = 0, fail = 0
    for (const row of valid) {
      const surfaceType = row.asphaltThickness > 0 ? 'asphalt' : 'dirt'
      const base = {
        zoneId: row.zoneId!, lineNumber: row.lineNumber, fromMH: row.fromMH, toMH: row.toMH,
        diameter: row.diameter, length: row.length, material: row.material,
        basecourseThickness: row.basecourseThickness, asphaltThickness: row.asphaltThickness, surfaceType,
        startLat: row.startLat, startLng: row.startLng, endLat: row.endLat, endLng: row.endLng,
      }
      try {
        if (row.isUpdate) {
          // Update existing segment (structural fields only)
          const updated = await api.patch(`/api/projects/${projectId}/segments/${row.id}`, base)
          setSegments(prev => prev.map(s => s.id === row.id ? updated : s))
        } else {
          const defaultAct = (qty: number) => ({ plannedQty: qty, actualQty: 0, pct: 0, status: 'not_started' })
          const seg = await api.post(`/api/projects/${projectId}/segments`, {
            ...base,
            excavation: defaultAct(row.length), piping: defaultAct(row.length),
            backfilling: defaultAct(row.length), basecourse: defaultAct(row.length),
            asphalt: defaultAct(row.length), overallPct: 0, status: 'not_started',
          })
          setSegments(prev => [seg, ...prev])
        }
        ok++
      } catch { fail++ }
      setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
    }
    setUpload(u => ({ ...u, finished: true }))
    setBulkRows([])
    setBulkSaving(false)
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
      basecourseThickness: String(seg.basecourseThickness ?? 0),
      asphaltThickness:    String(seg.asphaltThickness    ?? 0),
      startLat:   seg.startLat != null ? String(seg.startLat) : '',
      startLng:   seg.startLng != null ? String(seg.startLng) : '',
      endLat:     seg.endLat   != null ? String(seg.endLat)   : '',
      endLng:     seg.endLng   != null ? String(seg.endLng)   : '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteSeg(segId: string) {
    if (!confirm('Delete this segment?')) return
    try {
      await api.delete(`/api/projects/${projectId}/segments/${segId}`)
      setSegments(prev => prev.filter(s => s.id !== segId))
      setSelected(prev => { const n = new Set(prev); n.delete(segId); return n })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSel = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleArea = (ids: string[]) =>
    setSelected(prev => {
      const n = new Set(prev)
      const allOn = ids.every(id => n.has(id))
      ids.forEach(id => allOn ? n.delete(id) : n.add(id))
      return n
    })

  const displayedIds = displayed.map(s => s.id)
  const allSelected  = displayedIds.length > 0 && displayedIds.every(id => selected.has(id))
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(displayedIds))

  async function deleteSelected() {
    const ids = displayed.filter(s => selected.has(s.id)).map(s => s.id)
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} selected segment${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeletingBulk(true)
    setUpload({ open: true, title: 'Deleting segments', total: ids.length, done: 0, ok: 0, fail: 0, finished: false })
    let ok = 0, fail = 0
    for (const id of ids) {
      try {
        await api.delete(`/api/projects/${projectId}/segments/${id}`)
        setSegments(prev => prev.filter(s => s.id !== id))
        ok++
      } catch { fail++ }
      setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
    }
    setUpload(u => ({ ...u, finished: true }))
    setSelected(new Set())
    setDeletingBulk(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.zoneId) { setError('Please select a zone'); return }
    setSaving(true); setError('')
    const len   = Number(form.length) || 0
    const bcThk = Number(form.basecourseThickness) // allow 0
    const aspThk = Number(form.asphaltThickness)   // allow 0
    const body = {
      zoneId: form.zoneId, lineNumber: form.lineNumber.trim(),
      fromMH: form.fromMH.trim(), toMH: form.toMH.trim(),
      diameter: Number(form.diameter) || 0, length: len, material: form.material,
      basecourseThickness: bcThk, asphaltThickness: aspThk,
      surfaceType: aspThk > 0 ? 'asphalt' : 'dirt',
      startLat: form.startLat ? Number(form.startLat) : null,
      startLng: form.startLng ? Number(form.startLng) : null,
      endLat:   form.endLat   ? Number(form.endLat)   : null,
      endLng:   form.endLng   ? Number(form.endLng)   : null,
    }
    try {
      if (editSegment) {
        const updated = await api.patch(`/api/projects/${projectId}/segments/${editSegment.id}`, body)
        setSegments(prev => prev.map(s => s.id === editSegment.id ? updated : s))
      } else {
        const defaultAct = (qty: number) => ({ plannedQty: qty, actualQty: 0, pct: 0, status: 'not_started' })
        const seg = await api.post(`/api/projects/${projectId}/segments`, {
          ...body,
          excavation: defaultAct(len), piping: defaultAct(len),
          backfilling: defaultAct(len), basecourse: defaultAct(len),
          asphalt: defaultAct(len), overallPct: 0, status: 'not_started',
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

  const validBulkCount = bulkRows.filter(r => !r.error).length

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
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Project Segments</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">Individual pipe segments with engineering data</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadTemplate}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              ↓ Template
            </button>
            <button onClick={exportSegments} disabled={segments.length === 0}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
              title="Download current segments to edit in Excel">
              ⬇ Export
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="border border-[#2563FF] text-[#2563FF] text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              title="Import .xlsx — rows with an ID update, blank-ID rows are added">
              ↑ Import
            </button>
            <button onClick={() => { setForm(emptyForm); setEditSegment(null); setShowForm(v => !v) }}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
              + Add Segment
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <select className={filterCls} value={fZone}     onChange={e => setFZone(e.target.value)}>
          <option value="">All Areas</option>
          {uniqueZoneNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className={filterCls} value={fType}     onChange={e => setFType(e.target.value)}>
          <option value="">All Scopes</option>
          {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className={filterCls} style={{ width: 110 }} placeholder="Line No." value={fLine} onChange={e => setFLine(e.target.value)} />
        <select className={filterCls} value={fDia}      onChange={e => setFDia(e.target.value)}>
          <option value="">All Ø</option>
          {uniqueDias.map(d => <option key={d} value={d}>{d} mm</option>)}
        </select>
        <select className={filterCls} value={fMaterial} onChange={e => setFMaterial(e.target.value)}>
          <option value="">All Materials</option>
          {uniqueMaterials.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={filterCls} value={fSurface}  onChange={e => setFSurface(e.target.value)}>
          <option value="">All Surfaces</option>
          <option value="asphalt">Asphalt</option>
          <option value="dirt">Dirt</option>
        </select>
        <span className="ml-auto text-[12px] text-[#6B7280] dark:text-gray-400">
          {displayed.length} segments · {fmtN(totalLen, 1)} m
        </span>
        {(fZone||fType||fLine||fDia||fMaterial||fSurface) && (
          <button onClick={() => { setFZone(''); setFType(''); setFLine(''); setFDia(''); setFMaterial(''); setFSurface('') }}
            className="text-[11px] text-red-400 hover:text-red-600 transition-colors">
            ✕ Clear
          </button>
        )}
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
                {linearZones.map(z => <option key={z.id} value={z.id}>{zoneLabel(z)}</option>)}
              </select>
            </div>
            {[
              { key: 'lineNumber', label: 'Line No.', placeholder: 'L-001' },
              { key: 'fromMH',     label: 'From MH',  placeholder: 'MH-01' },
              { key: 'toMH',       label: 'To MH',    placeholder: 'MH-02' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">{f.label}</label>
                <input className={inputCls} value={(form as any)[f.key]} onChange={set(f.key)} placeholder={f.placeholder} />
              </div>
            ))}
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
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">
                Basecoarse Thickness (cm)
                <span className="ml-1 text-[9px] text-[#9CA3AF]">0 = absent</span>
              </label>
              <input className={inputCls} type="number" min="0" step="0.1" value={form.basecourseThickness} onChange={set('basecourseThickness')} placeholder="0" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">
                Asphalt Thickness (cm)
                <span className="ml-1 text-[9px] text-[#9CA3AF]">0 = Dirt surface</span>
              </label>
              <input className={inputCls} type="number" min="0" step="0.1" value={form.asphaltThickness} onChange={set('asphaltThickness')} placeholder="0" />
            </div>
            {[
              { key: 'startLat', label: 'Start Lat', placeholder: '24.123456' },
              { key: 'startLng', label: 'Start Lng', placeholder: '46.789012' },
              { key: 'endLat',   label: 'End Lat',   placeholder: '24.123789' },
              { key: 'endLng',   label: 'End Lng',   placeholder: '46.789345' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">{f.label}</label>
                <input className={inputCls} type="number" step="any" value={(form as any)[f.key]} onChange={set(f.key)} placeholder={f.placeholder} />
              </div>
            ))}
          </div>
          {/* Preview surface type */}
          {form.length && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] text-[#6B7280] dark:text-gray-400">Surface type:</span>
              {Number(form.asphaltThickness) > 0
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">Asphalt</span>
                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Dirt</span>
              }
            </div>
          )}
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
              <button onClick={() => { setShowBulk(false); setBulkRows([]); setBulkResult(null) }}
                className="text-[#6B7280] hover:text-black dark:hover:text-white text-xl">×</button>
            </div>
            {bulkResult ? (
              <div className="px-6 py-8 text-center">
                <p className="text-3xl mb-3">{bulkResult.fail === 0 ? '✅' : '⚠️'}</p>
                <p className="text-[15px] font-bold text-black dark:text-white mb-1">Upload complete</p>
                <p className="text-sm text-[#6B7280] dark:text-gray-400">{bulkResult.ok} saved · {bulkResult.fail} failed</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-[#F3F4F6] dark:bg-gray-800">
                      <tr>
                        {['Row','Action','Zone','Line','From','To','Ø mm','Length m','Material','Status'].map(h => (
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
                  <button onClick={confirmBulkUpload} disabled={bulkSaving || validBulkCount === 0}
                    className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
                    {bulkSaving ? `Saving… (${validBulkCount})` : `Save ${validBulkCount} Valid Rows`}
                  </button>
                  <button type="button" onClick={() => { setShowBulk(false); setBulkRows([]); setBulkResult(null) }}
                    className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bulk action bar — shown when rows are selected */}
      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-[#2563FF]/10 dark:bg-blue-900/20 border border-[#2563FF]/30 rounded-xl">
          <span className="text-[13px] font-semibold text-black dark:text-white">
            {selected.size} selected
          </span>
          <button onClick={deleteSelected} disabled={deletingBulk}
            className="text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 px-3.5 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
            🗑 Delete selected
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">🔧</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-1">No segments match</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">Add segments or adjust filters.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px] text-center">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {canEdit && (
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      title="Select all" className="w-4 h-4 rounded accent-[#2563FF] cursor-pointer" />
                  </th>
                )}
                {['Line','From → To','Ø mm','Len m','Material','Surface',
                  ...ACTIVITY_KEYS.map(a => a.label.slice(0,5)), ''].map((h, i) => (
                  <th key={i} className="px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider text-center">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {areaGroups.map(area => {
                const isCollapsed = collapsed.has(area.name)
                return (
                  <>
                    {/* Area header — checkbox selects the area; click toggles collapse */}
                    <tr key={`area-${area.name}`}
                      className="bg-[#F9FAFB] dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-700 select-none">
                      {canEdit && (
                        <td className="px-3 py-2.5 w-8">
                          <input type="checkbox"
                            checked={area.segs.length > 0 && area.segs.every(s => selected.has(s.id))}
                            onChange={() => toggleArea(area.segs.map(s => s.id))}
                            title="Select area"
                            className="w-4 h-4 rounded accent-[#2563FF] cursor-pointer" />
                        </td>
                      )}
                      <td colSpan={7 + ACTIVITY_KEYS.length} className="px-3 py-2.5 text-left cursor-pointer"
                        onClick={() => toggleCollapse(area.name)}>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-[12px] font-bold text-black dark:text-white">
                            <span className="inline-block w-3 text-[#6B7280] dark:text-gray-400">{isCollapsed ? '▸' : '▾'}</span>
                            {area.name}
                            <span className="text-[10px] font-normal text-[#6B7280] dark:text-gray-400">
                              ({area.segs.length})
                            </span>
                          </span>
                          <span className="text-[11px] font-semibold text-[#374151] dark:text-gray-300">
                            {fmtN(area.length, 1)} m
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Segment rows (hidden when collapsed) */}
                    {!isCollapsed && area.segs.map(seg => {
                      const zone = zoneMap[seg.zoneId]
                      return (
                        <tr key={seg.id} className={`transition-colors ${selected.has(seg.id) ? 'bg-[#2563FF]/5 dark:bg-blue-900/20' : 'hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50'}`}>
                          {canEdit && (
                            <td className="px-3 py-3 w-8">
                              <input type="checkbox" checked={selected.has(seg.id)} onChange={() => toggleSel(seg.id)}
                                className="w-4 h-4 rounded accent-[#2563FF] cursor-pointer" />
                            </td>
                          )}
                          <td className="px-3 py-3 font-semibold text-black dark:text-white">
                            {seg.lineNumber || '—'}
                            {zone?.type && <div className="text-[9px] font-normal text-[#9CA3AF] dark:text-gray-500">{zone.type}</div>}
                          </td>
                          <td className="px-3 py-3 text-[#374151] dark:text-gray-300 whitespace-nowrap">{seg.fromMH} → {seg.toMH}</td>
                          <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{fmtN(seg.diameter)}</td>
                          <td className="px-3 py-3 font-medium text-black dark:text-white">{fmtN(seg.length, 1)}</td>
                          <td className="px-3 py-3">
                            <span className="bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">{seg.material}</span>
                          </td>
                          <td className="px-3 py-3">{surfaceBadge(seg)}</td>
                          {ACTIVITY_KEYS.map(a => (
                            <td key={a.key} className="px-3 py-3">
                              <div className="flex justify-center">{activityDot(seg, a.key, a.color)}</div>
                            </td>
                          ))}
                          <td className="px-3 py-3">
                            <div className="flex gap-2 justify-center whitespace-nowrap">
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
                  </>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                {canEdit && <td />}
                <td className="px-3 py-3 text-[11px] font-bold text-black dark:text-white uppercase tracking-wider text-left">
                  Total ({displayed.length})
                </td>
                <td />
                <td />
                <td className="px-3 py-3 text-[12px] font-bold text-black dark:text-white">{fmtN(totalLen, 1)}</td>
                <td colSpan={3 + ACTIVITY_KEYS.length} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Animated upload progress */}
      <UploadProgressModal
        state={upload}
        onClose={() => setUpload(initialUpload)}
      />
    </div>
  )
}
