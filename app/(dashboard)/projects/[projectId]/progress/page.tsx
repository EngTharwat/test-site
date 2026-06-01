'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Segment, Zone, PIPE_MATERIALS, ACTIVITY_KEYS, fmtN } from '@/lib/types'

// The 5 activities in cascade order
const ACTIVITIES = [
  { key: 'excavation',  label: 'Excavation',  color: '#ef4444' },
  { key: 'piping',      label: 'Pipeline',    color: '#2563FF' },
  { key: 'backfilling', label: 'Backfilling', color: '#eab308' },
  { key: 'basecourse',  label: 'Base Course', color: '#22c55e' },
  { key: 'asphalt',     label: 'Asphalt',     color: '#111827' },
] as const

type ActivityKey = typeof ACTIVITIES[number]['key']

function isDone(seg: Segment, key: ActivityKey): boolean {
  return ((seg as any)[key]?.pct ?? 0) >= 100
}

function buildUpdates(seg: Segment, actIdx: number, checked: boolean) {
  const updates: Record<string, unknown> = {}
  const range = checked ? ACTIVITIES.slice(0, actIdx + 1) : ACTIVITIES.slice(actIdx)
  range.forEach(({ key }) => {
    updates[key] = {
      plannedQty: seg.length, actualQty: checked ? seg.length : 0,
      pct: checked ? 100 : 0, status: checked ? 'completed' : 'not_started',
    }
  })
  const checkedCount = ACTIVITIES.map(({ key }, i) => {
    if (checked  && i <= actIdx) return true
    if (!checked && i >= actIdx) return false
    return isDone(seg, key)
  }).filter(Boolean).length
  updates.overallPct = Math.round(checkedCount / ACTIVITIES.length * 100)
  updates.status = checkedCount === ACTIVITIES.length ? 'completed'
                 : checkedCount > 0                  ? 'in_progress'
                 : 'not_started'
  return updates
}

const filterCls = 'border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500'

export default function ProgressPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.isAdmin ?? false
  const canEdit = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).progress === 'edit'
    : false)

  const [segments, setSegments] = useState<Segment[]>([])
  const [zones,    setZones]    = useState<Zone[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)

  // Progress import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; fail: number; skipped: number } | null>(null)

  // Filters
  const [fZone,     setFZone]     = useState('')
  const [fType,     setFType]     = useState('')
  const [fLine,     setFLine]     = useState('')
  const [fDia,      setFDia]      = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [fSurface,  setFSurface]  = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const [segs, zns] = await Promise.all([
        api.get(`/api/projects/${projectId}/segments`),
        api.get(`/api/projects/${projectId}/zones`),
      ])
      setSegments(segs)
      setZones(zns)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const zoneMap      = Object.fromEntries(zones.map(z => [z.id, z]))
  const uniqueTypes  = [...new Set(zones.map(z => z.type).filter(Boolean))]
  const uniqueDias   = [...new Set(segments.map(s => s.diameter).filter(Boolean))].sort((a, b) => a - b)

  const zoneFilteredZones = fType ? zones.filter(z => z.type === fType) : zones

  // Apply all filters
  const displayed = segments.filter(seg => {
    const zone = zoneMap[seg.zoneId]
    if (fZone     && seg.zoneId !== fZone)                                             return false
    if (fType     && zone?.type !== fType)                                             return false
    if (fLine     && !seg.lineNumber?.toLowerCase().includes(fLine.toLowerCase()))     return false
    if (fDia      && String(seg.diameter) !== fDia)                                    return false
    if (fMaterial && seg.material !== fMaterial)                                        return false
    if (fSurface  && (seg.surfaceType ?? ((seg.asphaltThickness ?? 0) > 0 ? 'asphalt' : 'dirt')) !== fSurface) return false
    return true
  })

  // Sort: by zone order, then line number
  const sorted = [...displayed].sort((a, b) => {
    const zA = zoneMap[a.zoneId], zB = zoneMap[b.zoneId]
    const zo = (zA?.createdAt?.seconds ?? 0) - (zB?.createdAt?.seconds ?? 0)
    if (zo !== 0) return zo
    return (a.lineNumber ?? '').localeCompare(b.lineNumber ?? '', undefined, { numeric: true })
  })

  // Summary totals per activity (sum of length where done)
  const activityTotals = ACTIVITIES.map(({ key }) =>
    sorted.filter(s => isDone(s, key)).reduce((sum, s) => sum + (s.length || 0), 0)
  )
  const totalLength = sorted.reduce((s, seg) => s + (seg.length || 0), 0)

  async function toggle(seg: Segment, actIdx: number, checked: boolean) {
    if (!canEdit) return
    const updates = buildUpdates(seg, actIdx, checked)
    setSaving(seg.id)

    // Optimistic update
    setSegments(prev => prev.map(s => {
      if (s.id !== seg.id) return s
      const next: any = { ...s, ...updates }
      ACTIVITIES.forEach(({ key }) => { if (updates[key]) next[key] = updates[key] })
      return next
    }))

    try {
      await api.patch(`/api/projects/${projectId}/segments/${seg.id}`, updates)
    } catch {
      setSegments(prev => prev.map(s => s.id === seg.id ? seg : s))
    } finally {
      setSaving(null)
    }
  }

  // ── Export progress to Excel (TRUE/FALSE per activity) ──────────────────────
  async function exportProgress() {
    const XLSX = await import('xlsx')
    const headers = ['ID','Zone','Line','From','To','Length (m)',
                     ...ACTIVITIES.map(a => a.label)]
    const rows = sorted.map(s => {
      const z = zoneMap[s.zoneId]
      return [
        s.id,
        z ? `${z.name}${z.type ? ` — ${z.type}` : ''}` : '',
        s.lineNumber ?? '', s.fromMH ?? '', s.toMH ?? '', s.length ?? 0,
        ...ACTIVITIES.map(a => isDone(s, a.key) ? 'TRUE' : 'FALSE'),
      ]
    })
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [{wch:24},{wch:26},{wch:10},{wch:10},{wch:10},{wch:10},
                   ...ACTIVITIES.map(() => ({ wch: 13 }))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Progress')
    // Guide sheet
    const guide = XLSX.utils.aoa_to_sheet([
      ['How to use'],
      ['1. Set each activity cell to TRUE (done) or FALSE (not done).'],
      ['2. Accepted truthy values: TRUE, 1, yes, y, x, done.'],
      ['3. Keep the ID column unchanged so rows match existing segments.'],
      ['4. Save, then use "Import Progress" to apply.'],
    ])
    guide['!cols'] = [{ wch: 70 }]
    XLSX.utils.book_append_sheet(wb, guide, 'Instructions')
    XLSX.writeFile(wb, `pmboards-progress-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  // ── Import progress from Excel ──────────────────────────────────────────────
  const truthy = (v: any) => /^(true|1|yes|y|x|done|✓)$/i.test(String(v).trim())

  async function handleProgressFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportResult(null)
    const XLSX = await import('xlsx')
    const byId = new Map(segments.map(s => [s.id, s]))

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const wb   = XLSX.read(ev.target!.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]
      if (grid.length < 2) { setImporting(false); return }

      const [hdr, ...dataRows] = grid
      const idCol = hdr.findIndex((_: any, i: number) => /\bid\b/i.test(String(hdr[i])))
      const actCols = ACTIVITIES.map(a =>
        hdr.findIndex((_: any, i: number) => String(hdr[i]).trim().toLowerCase() === a.label.toLowerCase()))

      let ok = 0, fail = 0, skipped = 0
      for (const row of dataRows) {
        const id = idCol >= 0 ? String(row[idCol] ?? '').trim() : ''
        const seg = byId.get(id)
        if (!seg) { if (row.some((c: any) => String(c).trim())) skipped++; continue }

        // Read each activity flag from the sheet
        const flags = ACTIVITIES.map((_, i) => actCols[i] >= 0 ? truthy(row[actCols[i]]) : isDone(seg, ACTIVITIES[i].key))
        const updates: Record<string, unknown> = {}
        ACTIVITIES.forEach((a, i) => {
          updates[a.key] = {
            plannedQty: seg.length, actualQty: flags[i] ? seg.length : 0,
            pct: flags[i] ? 100 : 0, status: flags[i] ? 'completed' : 'not_started',
          }
        })
        const done = flags.filter(Boolean).length
        updates.overallPct = Math.round(done / ACTIVITIES.length * 100)
        updates.status = done === ACTIVITIES.length ? 'completed' : done > 0 ? 'in_progress' : 'not_started'

        try {
          const updated = await api.patch(`/api/projects/${projectId}/segments/${seg.id}`, updates)
          setSegments(prev => prev.map(s => s.id === seg.id ? updated : s))
          ok++
        } catch { fail++ }
      }
      setImportResult({ ok, fail, skipped })
      setImporting(false)
    }
    reader.readAsBinaryString(file)
  }

  if (loading) return (
    <div className="p-8 space-y-3">
      {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="p-6 md:p-8 max-w-full mx-auto">

      {/* Header */}
      <div className="mb-6">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleProgressFile} />
        <div className="flex items-start justify-between gap-4">
          <div>
            <button onClick={() => router.push(`/projects/${projectId}`)}
              className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
              ← Overview
            </button>
            <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Progress Tracking</h1>
            <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">
              Construction activity progress per segment
              {!canEdit && <span className="ml-2 text-[11px] text-orange-500">(view only)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={exportProgress} disabled={segments.length === 0}
              className="border border-gray-200 dark:border-gray-700 text-[#374151] dark:text-gray-300 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
              title="Download progress as Excel to fill in">
              ⬇ Export
            </button>
            {canEdit && (
              <button onClick={() => fileInputRef.current?.click()} disabled={importing}
                className="border border-[#2563FF] text-[#2563FF] text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50 transition-colors"
                title="Import progress from Excel (matches by ID)">
                {importing ? 'Importing…' : '↑ Import Progress'}
              </button>
            )}
          </div>
        </div>
        {importResult && (
          <div className="mt-3 text-[12px] px-3 py-2 rounded-lg bg-[#F3F4F6] dark:bg-gray-800 text-[#374151] dark:text-gray-300">
            ✓ Imported: <b>{importResult.ok}</b> updated · {importResult.fail} failed · {importResult.skipped} skipped (ID not found)
            <button onClick={() => setImportResult(null)} className="ml-3 text-[#9CA3AF] hover:text-black dark:hover:text-white">✕</button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <select className={filterCls} value={fZone}     onChange={e => { setFZone(e.target.value); if(!e.target.value) setFType('') }}>
          <option value="">All Zones</option>
          {zoneFilteredZones.map(z => <option key={z.id} value={z.id}>{z.name}{z.type ? ` — ${z.type}` : ''}</option>)}
        </select>
        <select className={filterCls} value={fType}     onChange={e => { setFType(e.target.value); setFZone('') }}>
          <option value="">All Types</option>
          {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className={filterCls} style={{ width: 110 }} placeholder="Line No." value={fLine} onChange={e => setFLine(e.target.value)} />
        <select className={filterCls} value={fDia}      onChange={e => setFDia(e.target.value)}>
          <option value="">All Ø</option>
          {uniqueDias.map(d => <option key={d} value={d}>{d} mm</option>)}
        </select>
        <select className={filterCls} value={fMaterial} onChange={e => setFMaterial(e.target.value)}>
          <option value="">All Materials</option>
          {PIPE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={filterCls} value={fSurface}  onChange={e => setFSurface(e.target.value)}>
          <option value="">All Surfaces</option>
          <option value="asphalt">Asphalt</option>
          <option value="dirt">Dirt</option>
        </select>
        <span className="ml-auto text-[12px] text-[#6B7280] dark:text-gray-400">
          {sorted.length} segments · {fmtN(totalLength, 1)} m
        </span>
        {(fZone||fType||fLine||fDia||fMaterial||fSurface) && (
          <button onClick={() => { setFZone(''); setFType(''); setFLine(''); setFDia(''); setFMaterial(''); setFSurface('') }}
            className="text-[11px] text-red-400 hover:text-red-600">✕ Clear</button>
        )}
      </div>

      {segments.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">📊</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-2">No segments to track</p>
          <button onClick={() => router.push(`/projects/${projectId}/segments`)}
            className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
            Go to Segments →
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-center py-12 text-[#6B7280] dark:text-gray-400 text-sm">No segments match the current filters.</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-center px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider w-10">#</th>
                <th className="text-left px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Line</th>
                <th className="text-left px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">From</th>
                <th className="text-left px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">To</th>
                <th className="text-right px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Dia</th>
                <th className="text-right px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Length</th>
                {ACTIVITIES.map(a => (
                  <th key={a.key} className="text-center px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: a.color }}>
                    {a.label}
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Overall</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((seg, idx) => {
                const zone      = zoneMap[seg.zoneId]
                const isSaving  = saving === seg.id
                const prevSeg   = idx > 0 ? sorted[idx - 1] : null
                const showZone  = !prevSeg || prevSeg.zoneId !== seg.zoneId
                const bcThk     = seg.basecourseThickness ?? -1   // -1 = legacy (show)
                const aspThk    = seg.asphaltThickness    ?? -1   // -1 = legacy (show)
                const showBc    = bcThk  !== 0   // hide if explicitly 0
                const showAsp   = aspThk !== 0   // hide if explicitly 0
                const overall   = seg.overallPct ?? 0

                return (
                  <>
                    {showZone && (
                      <tr key={`z-${seg.zoneId}`} className="bg-[#F9FAFB] dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
                        <td colSpan={6 + ACTIVITIES.length + 1}
                          className="px-3 py-2 text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">
                          {zone?.name ?? 'Unknown Zone'}
                          {zone?.type && <span className="ml-2 text-[10px] font-normal text-[#6B7280] dark:text-gray-400 normal-case">{zone.type}</span>}
                        </td>
                      </tr>
                    )}
                    <tr key={seg.id}
                      className={`border-t border-gray-50 dark:border-gray-800 ${isSaving ? 'opacity-60' : 'hover:bg-[#FAFAFA] dark:hover:bg-gray-800/30'} transition-colors`}>
                      <td className="text-center px-3 py-3 text-[#9CA3AF] font-mono text-[10px]">{idx + 1}</td>
                      <td className="px-3 py-3 font-semibold text-black dark:text-white">{seg.lineNumber || '—'}</td>
                      <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{seg.fromMH || '—'}</td>
                      <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{seg.toMH || '—'}</td>
                      <td className="px-3 py-3 text-right text-[#374151] dark:text-gray-300">{seg.diameter ? fmtN(seg.diameter) : '—'}</td>
                      <td className="px-3 py-3 text-right font-medium text-black dark:text-white">{fmtN(seg.length, 1)}</td>

                      {ACTIVITIES.map((act, actIdx) => {
                        // Conditionally hide Basecoarse (idx 3) or Asphalt (idx 4)
                        const hide = (actIdx === 3 && !showBc) || (actIdx === 4 && !showAsp)
                        if (hide) {
                          return <td key={act.key} className="px-3 py-3 text-center text-[#D1D5DB] dark:text-gray-700">—</td>
                        }
                        const done = isDone(seg, act.key)
                        return (
                          <td key={act.key} className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={done}
                              disabled={!canEdit || isSaving}
                              onChange={e => toggle(seg, actIdx, e.target.checked)}
                              className="w-4 h-4 rounded cursor-pointer disabled:cursor-default"
                              style={{ accentColor: act.color }}
                            />
                          </td>
                        )
                      })}

                      {/* Overall */}
                      <td className="px-3 py-3 text-center">
                        <span className={`text-[11px] font-bold ${
                          overall >= 100 ? 'text-green-600 dark:text-green-400'
                          : overall > 0  ? 'text-orange-500'
                          : 'text-[#9CA3AF] dark:text-gray-500'
                        }`}>
                          {overall}%
                        </span>
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>
            {/* Summary footer */}
            <tfoot>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <td colSpan={5} className="px-3 py-3 text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">
                  Total Done (m)
                </td>
                <td className="px-3 py-3 text-right text-[12px] font-bold text-black dark:text-white">{fmtN(totalLength, 1)}</td>
                {activityTotals.map((total, i) => (
                  <td key={i} className="px-3 py-3 text-center">
                    <div className="text-[11px] font-bold" style={{ color: ACTIVITIES[i].color }}>{fmtN(total, 1)}</div>
                    <div className="text-[9px] text-[#6B7280] dark:text-gray-400">m</div>
                  </td>
                ))}
                <td className="px-3 py-3 text-center text-[11px] font-bold text-[#6B7280] dark:text-gray-400">
                  {sorted.length > 0 ? Math.round(sorted.reduce((s, seg) => s + (seg.overallPct || 0), 0) / sorted.length) : 0}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
