'use client'

import { useState, useEffect, useCallback, use, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { Segment, Zone, fmtN } from '@/lib/types'
import type { MappedSegment } from './LeafletMap'

// Load Leaflet only in the browser (no SSR)
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl">
      <div className="text-[#6B7280] dark:text-gray-400 text-sm animate-pulse">Loading map…</div>
    </div>
  ),
})

const filterCls = 'border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500'

// Activities in cascade order, with their colors (matches Progress/Segments)
const ACTIVITY_DEFS = [
  { key: 'excavation',  label: 'Excavation',  color: '#ef4444' },
  { key: 'piping',      label: 'Pipeline',    color: '#2563FF' },
  { key: 'backfilling', label: 'Backfilling', color: '#eab308' },
  { key: 'basecourse',  label: 'Base Course', color: '#22c55e' },
  { key: 'asphalt',     label: 'Asphalt',     color: '#111827' },
] as const
const NOT_STARTED = { key: 'none', label: 'Not Started', color: '#9ca3af' }

// Index of the last (furthest) completed activity, -1 if none done.
function lastActivityIndex(seg: Segment): number {
  let idx = -1
  ACTIVITY_DEFS.forEach((a, i) => {
    if (((seg as any)[a.key]?.pct ?? 0) >= 100) idx = i
  })
  return idx
}
function lastActivityColor(seg: Segment): string {
  const i = lastActivityIndex(seg)
  return i >= 0 ? ACTIVITY_DEFS[i].color : NOT_STARTED.color
}

export default function MapPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()

  const [segments, setSegments] = useState<Segment[]>([])
  const [zones,    setZones]    = useState<Zone[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<MappedSegment | null>(null)

  // Detect dark mode (reads from <html> class set by the theme toggle)
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Filters
  const [fZone,     setFZone]     = useState('')
  const [fType,     setFType]     = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [fSurface,  setFSurface]  = useState('')
  const [fActivity, setFActivity] = useState('')   // '' all | activity key | 'none'

  // Bump to re-fit the map to the visible segments (Fit button)
  const [fitNonce, setFitNonce] = useState(0)
  const [showUnmapped, setShowUnmapped] = useState(false)

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

  // ── Derived ───────────────────────────────────────────────────────────────
  const zoneMap         = Object.fromEntries(zones.map(z => [z.id, z]))
  const uniqueTypes     = [...new Set(zones.map(z => z.type).filter(Boolean))]
  const uniqueZoneNames = [...new Set(zones.map(z => z.name).filter(Boolean))].sort()
  const uniqueMaterials = [...new Set(segments.map(s => s.material).filter(Boolean))].sort()

  const hasCoords = (s: Segment) =>
    s.startLat != null && s.startLng != null && s.endLat != null && s.endLng != null

  // Build mapped segments with zone info
  const allMapped: MappedSegment[] = segments
    .filter(hasCoords)
    .map((s) => {
      const zone = zoneMap[s.zoneId]
      return {
        ...s,
        zoneName:  zone?.name  ?? '—',
        zoneType:  zone?.type  ?? '',
        // Line/node color now reflects the segment's last completed activity
        zoneColor: lastActivityColor(s),
      }
    })

  // Apply filters
  const filteredMapped = allMapped.filter(s => {
    if (fZone     && s.zoneName !== fZone)                                         return false
    if (fType     && s.zoneType !== fType)                                         return false
    if (fMaterial && s.material !== fMaterial)                                     return false
    if (fSurface  && (s.surfaceType ?? ((s.asphaltThickness ?? 0) > 0 ? 'asphalt' : 'dirt')) !== fSurface) return false
    if (fActivity) {
      const idx = lastActivityIndex(s)
      if (fActivity === 'none') { if (idx !== -1) return false }
      else if (ACTIVITY_DEFS[idx]?.key !== fActivity) return false
    }
    return true
  })

  const unmapped = segments.filter(s => !hasCoords(s))

  // Activity legend + per-activity total length (grouped by each segment's
  // LAST completed activity, so totals sum to the mapped network length).
  const activitySummary = [...ACTIVITY_DEFS, NOT_STARTED].map((a, i) => {
    const idx = a.key === 'none' ? -1 : i
    const segs = filteredMapped.filter(s => lastActivityIndex(s) === idx)
    const length = segs.reduce((sum, s) => sum + (s.length || 0), 0)
    return { ...a, count: segs.length, length }
  })
  // Only show buckets that actually have segments
  const legendEntries = activitySummary.filter(a => a.count > 0)

  const totalLen = filteredMapped.reduce((s, seg) => s + (seg.length || 0), 0)

  // Active filters check
  const hasFilter = !!(fZone || fType || fMaterial || fSurface || fActivity)
  const clearFilters = () => { setFZone(''); setFType(''); setFMaterial(''); setFSurface(''); setFActivity('') }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.push(`/projects/${projectId}`)}
              className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-0.5 flex items-center gap-1 transition-colors">
              ← Overview
            </button>
            <h1 className="text-xl font-bold text-black dark:text-white tracking-[-0.4px]">Map / GIS</h1>
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-6 text-[12px] text-[#6B7280] dark:text-gray-400">
            <span>
              <span className="font-bold text-black dark:text-white">{filteredMapped.length}</span>
              {' '}mapped segments
            </span>
            <span>
              <span className="font-bold text-black dark:text-white">{fmtN(totalLen, 1)} m</span>
              {' '}total length
            </span>
            {unmapped.length > 0 && (
              <button
                onClick={() => setShowUnmapped(v => !v)}
                className={`text-[11px] font-semibold transition-colors ${showUnmapped ? 'text-orange-500' : 'text-[#9CA3AF] hover:text-orange-500'}`}
              >
                {unmapped.length} without coords
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <select className={filterCls} value={fZone}     onChange={e => setFZone(e.target.value)}>
            <option value="">All Zones</option>
            {uniqueZoneNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className={filterCls} value={fType}     onChange={e => setFType(e.target.value)}>
            <option value="">All Types</option>
            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
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
          <select className={filterCls} value={fActivity} onChange={e => setFActivity(e.target.value)}>
            <option value="">All Activities</option>
            {ACTIVITY_DEFS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            <option value="none">Not Started</option>
          </select>
          <button
            onClick={() => setFitNonce(n => n + 1)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#374151] dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title="Fit map to segments"
          >
            ⤢ Fit
          </button>
          {hasFilter && (
            <button onClick={clearFilters}
              className="text-[11px] text-red-400 hover:text-red-600 transition-colors">
              ✕ Clear
            </button>
          )}
          {selected && (
            <button onClick={() => setSelected(null)}
              className="ml-auto text-[11px] font-semibold text-[#2563FF] hover:underline">
              Clear selection
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 gap-0">

        {/* Map */}
        <div className="flex-1 relative min-h-0">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-4 bg-gray-300 dark:bg-gray-700 rounded animate-pulse w-48" />)}
              </div>
            </div>
          ) : segments.filter(hasCoords).length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <div className="text-5xl mb-4">📍</div>
                <p className="text-[15px] font-bold text-black dark:text-white mb-2">No GIS coordinates yet</p>
                <p className="text-sm text-[#6B7280] dark:text-gray-400 mb-5 max-w-xs">
                  Add Start Lat/Lng and End Lat/Lng to segments to see them on the map.
                </p>
                <button onClick={() => router.push(`/projects/${projectId}/segments`)}
                  className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
                  Go to Segments →
                </button>
              </div>
            </div>
          ) : (
            <LeafletMap
              mapped={filteredMapped}
              isDark={isDark}
              onSelect={setSelected}
              selected={selected}
              fitNonce={fitNonce}
            />
          )}

          {/* Legend — last activity by color */}
          {legendEntries.length > 0 && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg p-3">
              <div className="text-[9px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-2">Last Activity</div>
              <div className="space-y-1.5">
                {legendEntries.map(e => (
                  <div key={e.key} className="flex items-center gap-2">
                    <div className="w-6 h-1.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
                    <span className="text-[11px] text-black dark:text-white">{e.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary — total length per activity, aligned with the map */}
          {filteredMapped.length > 0 && (
            <div className="absolute top-4 right-4 z-[1000] bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg p-3 min-w-[190px]">
              <div className="text-[9px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-2">Length by Activity</div>
              <div className="space-y-1.5">
                {activitySummary.map(a => (
                  <div key={a.key} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                    <span className="text-[11px] text-black dark:text-white flex-1">{a.label}</span>
                    <span className="text-[11px] font-semibold text-[#374151] dark:text-gray-300 tabular-nums">
                      {fmtN(a.length, 1)} m
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-[11px] font-bold text-black dark:text-white flex-1">Total</span>
                  <span className="text-[11px] font-bold text-black dark:text-white tabular-nums">{fmtN(totalLen, 1)} m</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side panel: selected segment OR unmapped list */}
        {(selected || showUnmapped) && (
          <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">

            {/* Selected segment detail */}
            {selected && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-bold text-black dark:text-white">Segment Detail</h3>
                  <button onClick={() => setSelected(null)} className="text-[#9CA3AF] hover:text-black dark:hover:text-white">×</button>
                </div>

                {/* Zone color bar */}
                <div className="h-1.5 rounded-full mb-4" style={{ background: selected.zoneColor }} />

                <dl className="space-y-2 text-[12px]">
                  {[
                    { label: 'Line No.',  value: selected.lineNumber || '—' },
                    { label: 'Zone',      value: `${selected.zoneName}${selected.zoneType ? ` — ${selected.zoneType}` : ''}` },
                    { label: 'From MH',   value: selected.fromMH || '—' },
                    { label: 'To MH',     value: selected.toMH   || '—' },
                    { label: 'Diameter',  value: `${selected.diameter} mm` },
                    { label: 'Length',    value: `${fmtN(selected.length, 1)} m` },
                    { label: 'Material',  value: selected.material },
                    { label: 'Surface',   value: selected.surfaceType === 'asphalt' || (selected.asphaltThickness ?? 0) > 0 ? 'Asphalt' : 'Dirt' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-[#6B7280] dark:text-gray-400">{label}</dt>
                      <dd className="font-semibold text-black dark:text-white text-right max-w-[160px] truncate">{value}</dd>
                    </div>
                  ))}
                </dl>

                {/* Activities */}
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-2">Activities</div>
                  <div className="space-y-2">
                    {[
                      { key: 'excavation',  label: 'Excavation',  color: '#ef4444' },
                      { key: 'piping',      label: 'Pipeline',    color: '#2563FF' },
                      { key: 'backfilling', label: 'Backfilling', color: '#eab308' },
                      { key: 'basecourse',  label: 'Base Course', color: '#22c55e' },
                      { key: 'asphalt',     label: 'Asphalt',     color: '#111827' },
                    ].map(act => {
                      const done = ((selected as any)[act.key]?.pct ?? 0) >= 100
                      return (
                        <div key={act.key} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-full border-2 flex-shrink-0" style={{
                              background: done ? act.color : 'transparent',
                              borderColor: act.color,
                              opacity: done ? 1 : 0.5,
                            }} />
                            <span className="text-[12px] text-black dark:text-white">{act.label}</span>
                          </div>
                          <span className={`text-[11px] font-semibold ${done ? 'text-green-600 dark:text-green-400' : 'text-[#9CA3AF]'}`}>
                            {done ? 'Done' : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Coordinates */}
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-2">Coordinates</div>
                  <div className="space-y-1 text-[11px] font-mono text-[#374151] dark:text-gray-300">
                    <div>Start: {selected.startLat?.toFixed(6)}, {selected.startLng?.toFixed(6)}</div>
                    <div>End:   {selected.endLat?.toFixed(6)}, {selected.endLng?.toFixed(6)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Unmapped segments list */}
            {showUnmapped && !selected && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-bold text-black dark:text-white">
                    Without Coordinates
                    <span className="ml-2 text-[11px] font-normal text-[#6B7280] dark:text-gray-400">({unmapped.length})</span>
                  </h3>
                  <button onClick={() => setShowUnmapped(false)} className="text-[#9CA3AF] hover:text-black dark:hover:text-white">×</button>
                </div>
                <p className="text-[11px] text-[#6B7280] dark:text-gray-400 mb-4">
                  These segments have no GIS data. Edit them in Segments to add coordinates.
                </p>
                <div className="space-y-2">
                  {unmapped.map(seg => {
                    const zone = zoneMap[seg.zoneId]
                    return (
                      <div key={seg.id} className="px-3 py-2.5 bg-[#F9FAFB] dark:bg-gray-800 rounded-lg">
                        <div className="text-[12px] font-semibold text-black dark:text-white">{seg.lineNumber || '—'}</div>
                        <div className="text-[11px] text-[#6B7280] dark:text-gray-400">
                          {zone?.name ?? '—'}{zone?.type ? ` · ${zone.type}` : ''}
                        </div>
                        <div className="text-[11px] text-[#9CA3AF] dark:text-gray-500 mt-0.5">
                          {seg.fromMH} → {seg.toMH} · {fmtN(seg.length, 1)} m
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button
                  onClick={() => router.push(`/projects/${projectId}/segments`)}
                  className="mt-4 w-full text-[12px] font-semibold text-[#2563FF] hover:underline">
                  Edit in Segments →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
