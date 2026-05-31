'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Segment, Zone, fmtN } from '@/lib/types'

// ── Activity definitions (in cascade order) ───────────────────────────────────
const ACTIVITIES = [
  { key: 'excavation',  label: 'Excavation'  },
  { key: 'piping',      label: 'Pipeline'    },
  { key: 'backfilling', label: 'Backfilling' },
  { key: 'basecourse',  label: 'Base Course' },
  { key: 'asphalt',     label: 'Asphalt'     },
] as const

type ActivityKey = typeof ACTIVITIES[number]['key']

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDone(seg: Segment, key: ActivityKey): boolean {
  return ((seg as any)[key]?.pct ?? 0) >= 100
}

function buildActivityUpdate(seg: Segment, actIdx: number, checked: boolean) {
  const updates: Record<string, unknown> = {}
  const range = checked
    ? ACTIVITIES.slice(0, actIdx + 1)   // check this + all predecessors
    : ACTIVITIES.slice(actIdx)           // uncheck this + all successors

  range.forEach(({ key }) => {
    updates[key] = {
      plannedQty: seg.length,
      actualQty:  checked ? seg.length : 0,
      pct:        checked ? 100 : 0,
      status:     checked ? 'completed' : 'not_started',
    }
  })

  // Recalculate overallPct
  const allChecked = ACTIVITIES.map(({ key }, i) => {
    if (checked && i <= actIdx) return true
    if (!checked && i >= actIdx) return false
    return isDone(seg, key)
  })
  updates.overallPct = Math.round(allChecked.filter(Boolean).length / ACTIVITIES.length * 100)
  updates.status     = allChecked.every(Boolean) ? 'completed'
                     : allChecked.some(Boolean)  ? 'in_progress'
                     : 'not_started'

  return updates
}

export default function ProgressPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin  = profile?.isAdmin ?? false
  const canEdit  = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).progress === 'edit'
    : false)

  const [segments,   setSegments]   = useState<Segment[]>([])
  const [zones,      setZones]      = useState<Zone[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState<string | null>(null) // segmentId being saved

  // Filters
  const [filterType, setFilterType] = useState('')
  const [filterZone, setFilterZone] = useState('')

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

  // ── Derived data ──────────────────────────────────────────────────────────
  const zoneMap      = Object.fromEntries(zones.map(z => [z.id, z]))
  const uniqueTypes  = [...new Set(zones.map(z => z.type).filter(Boolean))]

  // Apply filters
  const displayed = segments.filter(seg => {
    const zone = zoneMap[seg.zoneId]
    if (filterType && zone?.type !== filterType) return false
    if (filterZone && seg.zoneId !== filterZone)  return false
    return true
  })

  // Sort: by zone creation order, then by lineNumber
  const sortedSegs = [...displayed].sort((a, b) => {
    const zA = zoneMap[a.zoneId]
    const zB = zoneMap[b.zoneId]
    const zOrder = (zA?.createdAt?.seconds ?? 0) - (zB?.createdAt?.seconds ?? 0)
    if (zOrder !== 0) return zOrder
    return (a.lineNumber ?? '').localeCompare(b.lineNumber ?? '', undefined, { numeric: true })
  })

  // Summary: total length per activity where done
  const activityTotals = ACTIVITIES.map(({ key }) =>
    sortedSegs.filter(s => isDone(s, key)).reduce((sum, s) => sum + (s.length || 0), 0)
  )
  const totalLength = sortedSegs.reduce((s, seg) => s + (seg.length || 0), 0)

  // ── Toggle handler ────────────────────────────────────────────────────────
  async function toggleActivity(seg: Segment, actIdx: number, checked: boolean) {
    if (!canEdit) return
    const updates = buildActivityUpdate(seg, actIdx, checked)
    setSaving(seg.id)

    // Optimistic update
    setSegments(prev => prev.map(s => {
      if (s.id !== seg.id) return s
      const next = { ...s, ...(updates as any) }
      ACTIVITIES.forEach(({ key }) => {
        if (updates[key]) next[key as ActivityKey] = updates[key as ActivityKey] as any
      })
      return next
    }))

    try {
      await api.patch(`/api/projects/${projectId}/segments/${seg.id}`, updates)
    } catch {
      // Revert on error
      setSegments(prev => prev.map(s => s.id === seg.id ? seg : s))
    } finally {
      setSaving(null)
    }
  }

  const zoneFilteredZones = filterType
    ? zones.filter(z => z.type === filterType)
    : zones

  if (loading) return (
    <div className="p-8 space-y-3">
      {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="p-6 md:p-8 max-w-full mx-auto">

      {/* Header */}
      <div className="mb-6">
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

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500"
          value={filterType} onChange={e => { setFilterType(e.target.value); setFilterZone('') }}
        >
          <option value="">All Types</option>
          {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-gray-500"
          value={filterZone} onChange={e => setFilterZone(e.target.value)}
        >
          <option value="">All Zones</option>
          {zoneFilteredZones.map(z => (
            <option key={z.id} value={z.id}>
              {z.name}{z.type ? ` — ${z.type}` : ''}
            </option>
          ))}
        </select>

        <span className="text-[12px] text-[#6B7280] dark:text-gray-400 ml-auto">
          {sortedSegs.length} segments · {fmtN(totalLength, 1)} m
        </span>
      </div>

      {segments.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">📊</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-2">No segments to track</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mb-5">
            Add pipe segments first, then track their construction activity here.
          </p>
          <button onClick={() => router.push(`/projects/${projectId}/segments`)}
            className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
            Go to Segments →
          </button>
        </div>
      ) : sortedSegs.length === 0 ? (
        <div className="text-center py-12 text-[#6B7280] dark:text-gray-400 text-sm">
          No segments match the current filters.
        </div>
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
                  <th key={a.key} className="text-center px-3 py-3 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSegs.map((seg, idx) => {
                const zone    = zoneMap[seg.zoneId]
                const isSaving = saving === seg.id

                // Show zone header row when zone changes
                const prevSeg  = idx > 0 ? sortedSegs[idx - 1] : null
                const showZone = !prevSeg || prevSeg.zoneId !== seg.zoneId

                return (
                  <>
                    {showZone && (
                      <tr key={`zone-${seg.zoneId}`} className="bg-[#F9FAFB] dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
                        <td colSpan={6 + ACTIVITIES.length}
                          className="px-3 py-2 text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">
                          {zone?.name ?? 'Unknown Zone'}
                          {zone?.type && (
                            <span className="ml-2 text-[10px] font-semibold text-[#6B7280] dark:text-gray-400 normal-case">
                              {zone.type}
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                    <tr key={seg.id}
                      className={`border-t border-gray-50 dark:border-gray-800 transition-colors ${isSaving ? 'opacity-60' : 'hover:bg-[#FAFAFA] dark:hover:bg-gray-800/30'}`}>
                      <td className="text-center px-3 py-3 text-[#9CA3AF] dark:text-gray-500 font-mono text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3 font-semibold text-black dark:text-white">{seg.lineNumber || '—'}</td>
                      <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{seg.fromMH || '—'}</td>
                      <td className="px-3 py-3 text-[#374151] dark:text-gray-300">{seg.toMH || '—'}</td>
                      <td className="px-3 py-3 text-right text-[#374151] dark:text-gray-300">{seg.diameter ? fmtN(seg.diameter) : '—'}</td>
                      <td className="px-3 py-3 text-right font-medium text-black dark:text-white">{fmtN(seg.length, 1)}</td>

                      {ACTIVITIES.map((act, actIdx) => {
                        const done = isDone(seg, act.key)
                        return (
                          <td key={act.key} className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={done}
                              disabled={!canEdit || isSaving}
                              onChange={e => toggleActivity(seg, actIdx, e.target.checked)}
                              className="w-4 h-4 rounded accent-[#2563FF] cursor-pointer disabled:cursor-default"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  </>
                )
              })}
            </tbody>

            {/* Summary footer */}
            <tfoot>
              <tr className="bg-[#F3F4F6] dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <td colSpan={5} className="px-3 py-3 text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">
                  Total Length Done
                </td>
                <td className="px-3 py-3 text-right text-[12px] font-bold text-black dark:text-white">
                  {fmtN(totalLength, 1)} m
                </td>
                {activityTotals.map((total, i) => (
                  <td key={i} className="px-3 py-3 text-center">
                    <div className="text-[11px] font-bold text-[#2563FF]">{fmtN(total, 1)}</div>
                    <div className="text-[9px] text-[#6B7280] dark:text-gray-400">m</div>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
