'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import {
  Permit, Segment, Zone, PermitLang, PERMIT_SHEET_COLUMNS,
  excavationLabel, excavationKind, EXCAV_KIND_COLORS, isHandedOver,
  permitExpiryState, daysRemaining, fmtN,
} from '@/lib/types'
import { UploadProgressModal, type UploadState, initialUpload } from '@/lib/upload-progress'

const filterCls = 'border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500'

// ── Bilingual UI strings ───────────────────────────────────────────────────
const T = {
  title:        { ar: 'تصاريح الأعمال',      en: 'Work Permits' },
  subtitle:     { ar: 'تصاريح البنية التحتية / الحفر وحالتها — تُدار عبر ملف الإكسيل من منصة بلدي',
                  en: 'Infrastructure / excavation permits — managed via the Balady Excel file' },
  overview:     { ar: 'إجراءات عبر الإكسيل فقط', en: 'Excel-managed (no manual edits)' },
  template:     { ar: 'تحميل القالب',        en: 'Template' },
  export:       { ar: 'تصدير',                en: 'Export' },
  import:       { ar: 'استيراد',              en: 'Import' },
  search:       { ar: 'بحث عن تصريح…',        en: 'Search permit…' },
  total:        { ar: 'إجمالي التصاريح',      en: 'Total Permits' },
  active:       { ar: 'سارية',                en: 'Active' },
  expiring:     { ar: 'قرب الانتهاء ≤٣٠ يوم', en: 'Expiring ≤30d' },
  expired:      { ar: 'منتهية',               en: 'Expired' },
  handedOver:   { ar: 'تم الإخلاء',           en: 'Handed Over' },
  allExcav:     { ar: 'كل حالات الحفرية',     en: 'All Excavation' },
  allState:     { ar: 'كل الحالات',           en: 'All States' },
  allDistricts: { ar: 'كل الأحياء',           en: 'All Districts' },
  clear:        { ar: 'مسح',                  en: 'Clear' },
  count:        { ar: 'تصريح',                en: 'permits' },
  emptyMatch:   { ar: 'لا توجد تصاريح مطابقة', en: 'No permits match' },
  emptyNone:    { ar: 'لا توجد تصاريح بعد',   en: 'No permits yet' },
  emptyHint:    { ar: 'حمّل القالب، الصق بيانات بلدي، ثم استورد الملف.',
                  en: 'Download the template, paste the Balady data, then import.' },
  segs:         { ar: 'المقاطع',              en: 'Segments' },
  link:         { ar: 'ربط',                  en: 'Link' },
  linkTitle:    { ar: 'ربط المقاطع بالتصريح',  en: 'Link segments to permit' },
  linkHint:     { ar: 'اختر المقاطع التابعة لهذا التصريح (كل مقطع يتبع تصريحًا واحدًا).',
                  en: 'Select the segments under this permit (each segment belongs to one permit).' },
  allZones:     { ar: 'كل النطاقات',          en: 'All Zones' },
  selected:     { ar: 'مُختار',               en: 'selected' },
  save:         { ar: 'حفظ',                  en: 'Save' },
  cancel:       { ar: 'إلغاء',                en: 'Cancel' },
  otherPermit:  { ar: 'مرتبط بتصريح آخر',     en: 'linked to another permit' },
  linkSheet:    { ar: 'قالب/تصدير الربط',      en: 'Link sheet' },
  importLinks:  { ar: 'استيراد الربط',         en: 'Import links' },
}

export default function PermitsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.isAdmin ?? false
  const canEdit = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).permits === 'edit'
    : false)

  const [lang, setLang] = useState<PermitLang>('ar')
  useEffect(() => {
    const saved = localStorage.getItem('pmboards-permits-lang')
    if (saved === 'en' || saved === 'ar') setLang(saved)
  }, [])
  const setLangPersist = (l: PermitLang) => { setLang(l); localStorage.setItem('pmboards-permits-lang', l) }
  const tr = (k: keyof typeof T) => T[k][lang]
  const rtl = lang === 'ar'

  const [permits,  setPermits]  = useState<Permit[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [zones,    setZones]    = useState<Zone[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // Segment-linking modal
  const [assignPermit, setAssignPermit] = useState<Permit | null>(null)
  const [sel,          setSel]          = useState<Set<string>>(new Set())
  const [assignZone,   setAssignZone]   = useState('')
  const [assignSaving, setAssignSaving] = useState(false)

  // Filters
  const [search,    setSearch]    = useState('')
  const [fExcav,    setFExcav]    = useState('')
  const [fState,    setFState]    = useState('')   // '' | handed_over | expired | soon | valid
  const [fDistrict, setFDistrict] = useState('')

  // Excel
  const fileRef     = useRef<HTMLInputElement>(null)
  const linkFileRef = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<UploadState>(initialUpload)

  const fetchAll = useCallback(async () => {
    try {
      setPermits(await api.get(`/api/projects/${projectId}/permits`))
      // Segments + zones power the linking modal; never block the page on them.
      api.get(`/api/projects/${projectId}/segments`).then(setSegments).catch(() => setSegments([]))
      api.get(`/api/projects/${projectId}/zones`).then(setZones).catch(() => setZones([]))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load permits')
    } finally {
      setLoading(false)
    }
  }, [projectId])
  useEffect(() => { fetchAll() }, [fetchAll])

  // State of a permit: handed-over takes priority over expiry
  const stateOf = (p: Permit): 'handed_over' | 'expired' | 'soon' | 'valid' | 'none' =>
    isHandedOver(p.excavation) ? 'handed_over' : permitExpiryState(p.expiryDate)

  const districts  = [...new Set(permits.map(p => p.district).filter(Boolean))].sort()
  const excavVals  = [...new Set(permits.map(p => p.excavation).filter(Boolean))]

  const displayed = permits.filter(p => {
    if (fExcav    && p.excavation !== fExcav)   return false
    if (fState    && stateOf(p) !== fState)     return false
    if (fDistrict && p.district !== fDistrict)  return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${p.permitNo} ${p.projectName} ${p.workOrderNo} ${p.district} ${p.contractor}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // KPIs — handed-over excluded from expiry buckets, counted separately
  const kpis = {
    total:      permits.length,
    active:     permits.filter(p => stateOf(p) === 'valid').length,
    expiring:   permits.filter(p => stateOf(p) === 'soon').length,
    expired:    permits.filter(p => stateOf(p) === 'expired').length,
    handedOver: permits.filter(p => stateOf(p) === 'handed_over').length,
  }

  // ── Segment linking ───────────────────────────────────────────────────────
  const zoneMap = Object.fromEntries(zones.map(z => [z.id, z]))
  const zoneLabel = (z?: Zone) => z ? (z.type ? `${z.name} — ${z.type}` : z.name) : '—'
  const linkedCount = (permitId: string) => segments.filter(s => s.permitId === permitId).length

  function openAssign(p: Permit) {
    setAssignPermit(p)
    setAssignZone('')
    setSel(new Set(segments.filter(s => s.permitId === p.id).map(s => s.id)))
  }

  const assignSegs = assignPermit
    ? segments
        .filter(s => !assignZone || s.zoneId === assignZone)
        .sort((a, b) => (zoneMap[a.zoneId]?.name ?? '').localeCompare(zoneMap[b.zoneId]?.name ?? '', undefined, { numeric: true })
          || (a.lineNumber ?? '').localeCompare(b.lineNumber ?? '', undefined, { numeric: true }))
    : []
  const selLength = segments.filter(s => sel.has(s.id)).reduce((sum, s) => sum + (s.length || 0), 0)

  async function saveAssign() {
    if (!assignPermit) return
    const before = new Set(segments.filter(s => s.permitId === assignPermit.id).map(s => s.id))
    const toAdd    = [...sel].filter(id => !before.has(id))                 // now linked here
    const toRemove = [...before].filter(id => !sel.has(id))                 // unlinked here
    const changes: { id: string; permitId: string }[] = [
      ...toAdd.map(id => ({ id, permitId: assignPermit.id })),
      ...toRemove.map(id => ({ id, permitId: '' })),
    ]
    if (!changes.length) { setAssignPermit(null); return }
    setAssignSaving(true)
    setUpload({ open: true, title: lang === 'ar' ? 'ربط المقاطع' : 'Linking segments', total: changes.length, done: 0, ok: 0, fail: 0, finished: false })
    let ok = 0, fail = 0
    for (const c of changes) {
      try {
        const updated = await api.patch(`/api/projects/${projectId}/segments/${c.id}`, { permitId: c.permitId })
        setSegments(prev => prev.map(s => s.id === c.id ? updated : s))
        ok++
      } catch { fail++ }
      setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
    }
    setUpload(u => ({ ...u, finished: true }))
    setAssignSaving(false)
    setAssignPermit(null)
  }

  // ── Link via Excel — one row per SEGMENT (segment-level, not whole line) ────
  // Columns: Segment ID (exact match) + Line/From/To (readable, also used as a
  // fallback composite key) + Permit No. (the value to fill / current link).
  const LINK_COLS: { key: string; ar: string; en: string }[] = [
    { key: 'segId',      ar: 'معرّف المقطع', en: 'Segment ID' },
    { key: 'lineNumber', ar: 'رقم الخط',     en: 'Line No.' },
    { key: 'fromMH',     ar: 'من',           en: 'From MH' },
    { key: 'toMH',       ar: 'إلى',          en: 'To MH' },
    { key: 'zone',       ar: 'النطاق',       en: 'Zone' },
    { key: 'permitNo',   ar: 'رقم التصريح',  en: 'Permit No.' },
  ]

  async function downloadLinkSheet() {
    const XLSX = await import('xlsx')
    const permitNoById = Object.fromEntries(permits.map(p => [p.id, p.permitNo]))
    const headers = LINK_COLS.map(c => c.ar)
    const rows = [...segments]
      .sort((a, b) => (zoneMap[a.zoneId]?.name ?? '').localeCompare(zoneMap[b.zoneId]?.name ?? '', undefined, { numeric: true })
        || (a.lineNumber ?? '').localeCompare(b.lineNumber ?? '', undefined, { numeric: true }))
      .map(s => [s.id, s.lineNumber ?? '', s.fromMH ?? '', s.toMH ?? '', zoneLabel(zoneMap[s.zoneId]), s.permitId ? (permitNoById[s.permitId] ?? '') : ''])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 16 }]
    ;(ws as any)['!rtl'] = true
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ربط')
    XLSX.writeFile(wb, 'pmboards-permit-links.xlsx')
  }

  async function handleLinkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const XLSX = await import('xlsx')
    const norm = (s: any) => String(s ?? '').trim().replace(/\s+/g, ' ')
    const key = (l: string, f: string, t: string) => `${norm(l)}|${norm(f)}|${norm(t)}`.toLowerCase()

    const permitByNo = new Map(permits.filter(p => p.permitNo).map(p => [norm(p.permitNo).toLowerCase(), p]))
    const segById    = new Map(segments.map(s => [s.id, s]))
    const segByComposite = new Map<string, Segment>()
    segments.forEach(s => segByComposite.set(key(s.lineNumber, s.fromMH, s.toMH), s))

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const wb   = XLSX.read(ev.target!.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]
      if (grid.length < 2) { setError(lang === 'ar' ? 'الملف فارغ' : 'Empty file'); return }

      const match = (cellVal: string, col: typeof LINK_COLS[number]) => {
        const n = norm(cellVal).toLowerCase()
        return n === norm(col.ar).toLowerCase() || n === norm(col.en).toLowerCase()
      }
      let hRow = grid.findIndex(r => r.some((c: any) => match(c, LINK_COLS[5])))   // row with رقم التصريح
      if (hRow < 0) hRow = 0
      const hdr = grid[hRow]
      const idx: Record<string, number> = {}
      LINK_COLS.forEach(c => { const i = hdr.findIndex((_: any, j: number) => match(hdr[j], c)); if (i >= 0) idx[c.key] = i })
      if (idx.permitNo == null) { setError(lang === 'ar' ? 'تعذّر إيجاد عمود رقم التصريح' : 'No Permit No. column'); return }

      const cell = (row: any[], k: string) => idx[k] != null ? norm(row[idx[k]]) : ''
      // Resolve which segment a row points to (ID first, else line+from+to)
      const segOf = (row: any[]): Segment | undefined =>
        (idx.segId != null && segById.get(cell(row, 'segId')))
        || segByComposite.get(key(cell(row, 'lineNumber'), cell(row, 'fromMH'), cell(row, 'toMH')))

      // Build the desired permitId per segment; only rows that resolve to a segment count.
      const changes: { seg: Segment; permitId: string }[] = []
      for (const row of grid.slice(hRow + 1)) {
        if (!row.some((c: any) => norm(c))) continue
        const seg = segOf(row)
        if (!seg) continue
        const pno = cell(row, 'permitNo')
        const permit = pno ? permitByNo.get(pno.toLowerCase()) : null
        const desired = permit?.id ?? ''               // blank Permit No. → unlink
        if ((seg.permitId ?? '') !== desired) changes.push({ seg, permitId: desired })
      }
      if (!changes.length) { setError(lang === 'ar' ? 'لا توجد تغييرات للربط' : 'No link changes found'); return }

      setUpload({ open: true, title: lang === 'ar' ? 'ربط المقاطع بالإكسيل' : 'Linking via Excel', total: changes.length, done: 0, ok: 0, fail: 0, finished: false })
      let ok = 0, fail = 0
      for (const c of changes) {
        try {
          const updated = await api.patch(`/api/projects/${projectId}/segments/${c.seg.id}`, { permitId: c.permitId })
          setSegments(prev => prev.map(s => s.id === c.seg.id ? updated : s))
          ok++
        } catch { fail++ }
        setUpload(u => ({ ...u, done: u.done + 1, ok, fail }))
      }
      setUpload(u => ({ ...u, finished: true }))
    }
    reader.readAsBinaryString(file)
  }

  // ── Excel (Balady format) ─────────────────────────────────────────────────
  const FIELD_KEYS = PERMIT_SHEET_COLUMNS.map(c => c.key as keyof Permit)

  async function exportXlsx(blankTemplate = false) {
    const XLSX = await import('xlsx')
    const headers = PERMIT_SHEET_COLUMNS.map(c => c.ar)   // Balady = Arabic headers
    const rows = blankTemplate ? [] : displayed.map(p => FIELD_KEYS.map(k => (p as any)[k] ?? ''))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map(() => ({ wch: 18 }))
    ;(ws as any)['!rtl'] = true
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
    const byPermitNo = new Map(permits.filter(p => p.permitNo).map(p => [p.permitNo.trim(), p]))
    const norm = (s: any) => String(s ?? '').trim().replace(/\s+/g, ' ')

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const wb   = XLSX.read(ev.target!.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]
      if (grid.length < 2) { setError('الملف لا يحتوي على بيانات / File has no data rows'); return }

      // Find header row (handles a title row above). Accept Arabic OR English headers.
      const matchHeader = (cellVal: string, col: typeof PERMIT_SHEET_COLUMNS[number]) => {
        const n = norm(cellVal).toLowerCase()
        return n === norm(col.ar).toLowerCase() || n === norm(col.en).toLowerCase()
      }
      let headerRowIdx = grid.findIndex(r => r.some((c: any) =>
        matchHeader(c, PERMIT_SHEET_COLUMNS[0])))   // row containing رقم التصريح / Permit No.
      if (headerRowIdx < 0) headerRowIdx = 0
      const hdr = grid[headerRowIdx]
      const dataRows = grid.slice(headerRowIdx + 1)

      const idx: Partial<Record<keyof Permit, number>> = {}
      PERMIT_SHEET_COLUMNS.forEach(col => {
        const i = hdr.findIndex((_: any, j: number) => matchHeader(hdr[j], col))
        if (i >= 0) idx[col.key] = i
      })
      if (idx.permitNo == null) {
        setError(lang === 'ar' ? 'تعذّر إيجاد عمود رقم التصريح' : 'Could not find the Permit No. column')
        return
      }

      const rawCell = (row: any[], key: keyof Permit) => idx[key] != null ? row[idx[key]!] : ''
      const cell = (row: any[], key: keyof Permit) => norm(rawCell(row, key))

      // Balady dates arrive as Excel serial numbers (e.g. 43000) → YYYY-MM-DD
      const DATE_KEYS = new Set<keyof Permit>(['startDate', 'expiryDate'])
      const toDateStr = (v: any): string => {
        if (v == null || v === '') return ''
        if (v instanceof Date)
          return `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}-${String(v.getUTCDate()).padStart(2,'0')}`
        const s = String(v).trim()
        const n = typeof v === 'number' ? v : (/^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN)
        if (!Number.isNaN(n) && n > 59 && n < 80000) {
          const d = (XLSX as any).SSF?.parse_date_code(n)
          if (d && d.y) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
        }
        return s
      }

      const valid = dataRows.filter(r => r.some((c: any) => norm(c)) && cell(r, 'permitNo'))
      if (!valid.length) { setError(lang === 'ar' ? 'لا توجد صفوف تحتوي على رقم تصريح' : 'No rows with a Permit No.'); return }

      setUpload({ open: true, title: lang === 'ar' ? 'استيراد التصاريح' : 'Importing permits',
        total: valid.length, done: 0, ok: 0, fail: 0, finished: false })
      let ok = 0, fail = 0
      for (const row of valid) {
        const payload: Record<string, string> = {}
        FIELD_KEYS.forEach(k => { payload[k] = DATE_KEYS.has(k) ? toDateStr(rawCell(row, k)) : cell(row, k) })
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

  // ── Cells ─────────────────────────────────────────────────────────────────
  function ExcavChip({ raw }: { raw: string }) {
    if (!raw) return <span className="text-[#9CA3AF]">—</span>
    const c = EXCAV_KIND_COLORS[excavationKind(raw)]
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{excavationLabel(raw, lang)}</span>
  }
  function ExpiryCell({ p }: { p: Permit }) {
    if (isHandedOver(p.excavation)) {
      return (
        <span className="inline-flex flex-col items-end gap-0.5">
          {p.expiryDate && <span className="text-[11px] text-[#9CA3AF] line-through">{p.expiryDate}</span>}
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">{tr('handedOver')}</span>
        </span>
      )
    }
    const st = permitExpiryState(p.expiryDate)
    if (st === 'none') return <span className="text-[#9CA3AF]">—</span>
    const d = daysRemaining(p.expiryDate)
    const cls = st === 'expired' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : st === 'soon'    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
              :                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    const txt = st === 'expired'
      ? (lang === 'ar' ? `منتهي ${Math.abs(d)} يوم` : `Expired ${Math.abs(d)}d`)
      : (lang === 'ar' ? `${d} يوم متبقي` : `${d}d left`)
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="text-[11px] text-[#374151] dark:text-gray-300">{p.expiryDate}</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{txt}</span>
      </span>
    )
  }

  const hasFilter = !!(search || fExcav || fState || fDistrict)
  const headers = ['permitNo','amanah','municipality','district','startDate','excavation','expiryDate'] as const
  const headerLabel = (key: string) => PERMIT_SHEET_COLUMNS.find(c => c.key === key)?.[lang] ?? key

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" dir={rtl ? 'rtl' : 'ltr'}>
      <input ref={fileRef}     type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
      <input ref={linkFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleLinkFile} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
            ← {lang === 'ar' ? 'نظرة عامة' : 'Overview'}
          </button>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">{tr('title')}</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">{tr('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Language toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-[12px] font-semibold">
            <button onClick={() => setLangPersist('ar')}
              className={`px-3 py-2 transition-colors ${lang === 'ar' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-[#6B7280] dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>عربي</button>
            <button onClick={() => setLangPersist('en')}
              className={`px-3 py-2 transition-colors ${lang === 'en' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-[#6B7280] dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>EN</button>
          </div>
          {canEdit && <>
            <button onClick={() => exportXlsx(true)}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">↓ {tr('template')}</button>
            <button onClick={() => exportXlsx(false)} disabled={permits.length === 0}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">⬇ {tr('export')}</button>
            <button onClick={() => fileRef.current?.click()}
              className="bg-[#2563FF] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#1A3FAE] transition-colors">↑ {tr('import')}</button>
            <span className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
            <button onClick={downloadLinkSheet} disabled={segments.length === 0}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">🔗 {tr('linkSheet')}</button>
            <button onClick={() => linkFileRef.current?.click()} disabled={segments.length === 0}
              className="border border-[#2563FF] text-[#2563FF] text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 transition-colors">↑ {tr('importLinks')}</button>
          </>}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: tr('total'),      value: kpis.total,      accent: undefined as string | undefined },
          { label: tr('active'),     value: kpis.active,     accent: '#22c55e' },
          { label: tr('expiring'),   value: kpis.expiring,   accent: kpis.expiring ? '#f97316' : undefined },
          { label: tr('expired'),    value: kpis.expired,    accent: kpis.expired ? '#ef4444' : undefined },
          { label: tr('handedOver'), value: kpis.handedOver, accent: kpis.handedOver ? '#06b6d4' : undefined },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-800">
            <div className="text-[10px] font-semibold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">{k.label}</div>
            <div className="text-2xl font-bold tracking-[-0.5px] dark:text-white" style={{ color: k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <input className={filterCls} style={{ width: 170 }} placeholder={tr('search')} value={search} onChange={e => setSearch(e.target.value)} />
        <select className={filterCls} value={fState} onChange={e => setFState(e.target.value)}>
          <option value="">{tr('allState')}</option>
          <option value="valid">{tr('active')}</option>
          <option value="soon">{tr('expiring')}</option>
          <option value="expired">{tr('expired')}</option>
          <option value="handed_over">{tr('handedOver')}</option>
        </select>
        <select className={filterCls} value={fExcav} onChange={e => setFExcav(e.target.value)}>
          <option value="">{tr('allExcav')}</option>
          {excavVals.map(s => <option key={s} value={s}>{excavationLabel(s, lang)}</option>)}
        </select>
        {districts.length > 0 && (
          <select className={filterCls} value={fDistrict} onChange={e => setFDistrict(e.target.value)}>
            <option value="">{tr('allDistricts')}</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <span className="ms-auto text-[12px] text-[#6B7280] dark:text-gray-400">{displayed.length} {tr('count')}</span>
        {hasFilter && (
          <button onClick={() => { setSearch(''); setFExcav(''); setFState(''); setFDistrict('') }}
            className="text-[11px] text-red-400 hover:text-red-600">✕ {tr('clear')}</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">📄</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-1">{permits.length ? tr('emptyMatch') : tr('emptyNone')}</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">{tr('emptyHint')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px] text-center whitespace-nowrap">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {headers.map(h => (
                  <th key={h} className="px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 tracking-wider">{headerLabel(h)}</th>
                ))}
                <th className="px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 tracking-wider">{tr('segs')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {displayed.map(p => (
                <tr key={p.id} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-3 font-semibold text-black dark:text-white">{p.permitNo || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.amanah || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.municipality || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.district || '—'}</td>
                  <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{p.startDate || '—'}</td>
                  <td className="px-3 py-3"><ExcavChip raw={p.excavation} /></td>
                  <td className="px-3 py-3 text-center"><ExpiryCell p={p} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[11px] font-semibold text-black dark:text-white tabular-nums">{linkedCount(p.id)}</span>
                      {canEdit && (
                        <button onClick={() => openAssign(p)}
                          className="text-[11px] text-[#2563FF] hover:underline whitespace-nowrap">🔗 {tr('link')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Segment-linking modal */}
      {assignPermit && (
        <div className="fixed inset-0 z-[1500] bg-black/60 flex items-start justify-center pt-10 px-4 overflow-y-auto"
             onClick={() => setAssignPermit(null)} dir={rtl ? 'rtl' : 'ltr'}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-2xl mb-10"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-bold text-black dark:text-white">{tr('linkTitle')}</h2>
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-0.5">
                  {assignPermit.permitNo} · {sel.size} {tr('selected')} · {fmtN(selLength, 1)} m
                </p>
              </div>
              <button onClick={() => setAssignPermit(null)} className="text-[#6B7280] hover:text-black dark:hover:text-white text-xl">×</button>
            </div>

            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <p className="text-[12px] text-[#6B7280] dark:text-gray-400 flex-1">{tr('linkHint')}</p>
              {zones.length > 0 && (
                <select className={filterCls} value={assignZone} onChange={e => setAssignZone(e.target.value)}>
                  <option value="">{tr('allZones')}</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{zoneLabel(z)}</option>)}
                </select>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
              {assignSegs.length === 0 ? (
                <p className="px-6 py-8 text-center text-[13px] text-[#6B7280] dark:text-gray-400">
                  {lang === 'ar' ? 'لا توجد مقاطع' : 'No segments'}
                </p>
              ) : assignSegs.map(s => {
                const checked = sel.has(s.id)
                const otherPermit = s.permitId && s.permitId !== assignPermit.id
                  ? permits.find(p => p.id === s.permitId) : null
                return (
                  <label key={s.id} className="flex items-center gap-3 px-6 py-2.5 cursor-pointer hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50">
                    <input type="checkbox" checked={checked}
                      onChange={() => setSel(prev => { const n = new Set(prev); checked ? n.delete(s.id) : n.add(s.id); return n })}
                      className="w-4 h-4 rounded accent-[#2563FF]" />
                    <span className="text-[12px] font-semibold text-black dark:text-white w-16">{s.lineNumber || '—'}</span>
                    <span className="text-[11px] text-[#6B7280] dark:text-gray-400 flex-1 truncate">
                      {zoneLabel(zoneMap[s.zoneId])} · {s.fromMH}→{s.toMH} · {fmtN(s.length || 0, 1)} m
                    </span>
                    {otherPermit && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
                        {otherPermit.permitNo} · {tr('otherPermit')}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={saveAssign} disabled={assignSaving}
                className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
                {tr('save')} ({sel.size})
              </button>
              <button onClick={() => setAssignPermit(null)}
                className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">{tr('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      <UploadProgressModal state={upload} onClose={() => setUpload(initialUpload)} />
    </div>
  )
}
