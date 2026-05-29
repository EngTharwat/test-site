'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Segment, Zone, ACTIVITY_KEYS, formatLength, fmtN } from '@/lib/types'

export default function ProgressPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin     = profile?.isAdmin ?? false
  const canSeeSegs  = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).segments !== 'none'
    : false)

  const [segments, setSegments] = useState<Segment[]>([])
  const [zones,    setZones]    = useState<Zone[]>([])
  const [loading,  setLoading]  = useState(true)

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

  // Aggregate by activity across all segments
  const totalLen = segments.reduce((s, seg) => s + (seg.length || 0), 0)

  const activityStats = ACTIVITY_KEYS.map(act => {
    const planned = segments.reduce((s, seg) => s + ((seg as any)[act.key]?.plannedQty || 0), 0)
    const actual  = segments.reduce((s, seg) => s + ((seg as any)[act.key]?.actualQty  || 0), 0)
    const pct     = planned > 0 ? Math.round((actual / planned) * 100) : 0
    return { ...act, planned, actual, pct }
  })

  // By zone
  const byZone = zones.map(zone => {
    const zSegs = segments.filter(s => s.zoneId === zone.id)
    const len   = zSegs.reduce((s, seg) => s + (seg.length || 0), 0)
    const avgPct = zSegs.length
      ? Math.round(zSegs.reduce((s, seg) => s + (seg.overallPct || 0), 0) / zSegs.length)
      : 0
    return { ...zone, segLen: len, computedPct: avgPct, segCount: zSegs.length }
  })

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push(`/projects/${projectId}`)}
          className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
          ← Overview
        </button>
        <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Progress Tracking</h1>
        <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">Activity-level progress aggregated from all pipe segments</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : segments.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">📊</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-2">No segments to aggregate</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mb-5">Add pipe segments first, then their activity progress will appear here.</p>
          {canSeeSegs && (
            <button
              onClick={() => router.push(`/projects/${projectId}/segments`)}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors"
            >
              Go to Segments →
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Activity KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            {activityStats.map(act => (
              <div key={act.key} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-2">{act.label}</div>
                <div className="text-3xl font-bold tracking-[-1px] mb-3" style={{ color: act.color }}>{act.pct}%</div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full" style={{ width: `${act.pct}%`, background: act.color }} />
                </div>
                <div className="text-[10px] text-[#6B7280] dark:text-gray-400">{fmtN(act.actual)} / {fmtN(act.planned)} m</div>
              </div>
            ))}
          </div>

          {/* Project-level summary */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">Project Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Total Segments</div>
                <div className="text-2xl font-bold text-black dark:text-white">{segments.length}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Total Network</div>
                <div className="text-2xl font-bold text-black dark:text-white">{formatLength(totalLen)}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Zones</div>
                <div className="text-2xl font-bold text-black dark:text-white">{zones.length}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider mb-1">Overall Progress</div>
                <div className="text-2xl font-bold text-black dark:text-white">
                  {segments.length ? Math.round(segments.reduce((s, seg) => s + (seg.overallPct || 0), 0) / segments.length) : 0}%
                </div>
              </div>
            </div>
          </div>

          {/* Zone breakdown */}
          {byZone.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Progress by Zone</h2>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {byZone.map(z => (
                  <div key={z.id} className="grid grid-cols-[1fr_80px_80px_160px] items-center gap-4 px-6 py-4">
                    <div>
                      <span className="text-[13px] font-semibold text-black dark:text-white">{z.name}</span>
                      <span className="text-[11px] text-[#6B7280] dark:text-gray-400 ml-2">{z.segCount} segs · {fmtN(z.segLen)} m</span>
                    </div>
                    <span className="text-[12px] text-[#6B7280] dark:text-gray-400 text-center">{formatLength(z.executedLength || 0)}</span>
                    <span className="text-[12px] font-bold text-black dark:text-white text-right">{z.computedPct}%</span>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#2563FF]" style={{ width: `${z.computedPct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
