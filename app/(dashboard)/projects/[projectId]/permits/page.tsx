'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import {
  Permit, PermitLang, PERMIT_SHEET_COLUMNS,
  excavationLabel, excavationKind, EXCAV_KIND_COLORS, isHandedOver,
  permitExpiryState, daysRemaining,
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

  const [permits, setPermits] = useState<Permit[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // Filters
  const [search,    setSearch]    = useState('')
  const [fExcav,    setFExcav]    = useState('')
  const [fState,    setFState]    = useState('')   // '' | handed_over | expired | soon | valid
  const [fDistrict, setFDistrict] = useState('')

  // Excel
  const fileRef = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<UploadState>(initialUpload)

  const fetchAll = useCallback(async () => {
    try {
      setPermits(await api.get(`/api/projects/${projectId}/permits`))
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
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UploadProgressModal state={upload} onClose={() => setUpload(initialUpload)} />
    </div>
  )
}
