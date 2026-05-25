'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import {
  Project, Zone, CashFlowRecord, CashFlowWithComputed,
  STATUS_LABELS, STATUS_COLORS, PROJECT_TYPE_LABELS,
  ACTIVITY_KEYS, formatCurrency, formatLength, daysRemaining,
  MONTH_NAMES,
} from '@/lib/types'

function StatusBadge({ status }: { status: Project['status'] }) {
  const c = STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200">
      <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tracking-[-0.5px]" style={{ color: accent ?? '#000' }}>{value}</div>
      {sub && <div className="text-[11px] text-[#6B7280] mt-1">{sub}</div>}
    </div>
  )
}

function ProgressBar({ pct, color = '#2563FF', height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div className="bg-gray-100 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

export default function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()

  const [project,   setProject]  = useState<Project | null>(null)
  const [zones,     setZones]    = useState<Zone[]>([])
  const [cashflow,  setCashflow] = useState<CashFlowWithComputed[]>([])
  const [loading,   setLoading]  = useState(true)
  const [error,     setError]    = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const [proj, zoneData, cfData] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/projects/${projectId}/zones`),
        api.get(`/api/projects/${projectId}/cashflow`),
      ])
      setProject(proj)
      setZones(zoneData)

      // Compute cumulative values
      let cumP = 0, cumA = 0
      const withCumulative: CashFlowWithComputed[] = (cfData as CashFlowRecord[])
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
        .map(r => {
          cumP += r.planned
          cumA += r.actual
          return { ...r, variance: r.actual - r.planned, cumulativePlanned: cumP, cumulativeActual: cumA }
        })
      setCashflow(withCumulative)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return (
    <div className="p-8 space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
    </div>
  )

  if (error || !project) return (
    <div className="p-8">
      <p className="text-red-600">{error || 'Project not found'}</p>
    </div>
  )

  const days        = project.contractEndDate ? daysRemaining(project.contractEndDate) : null
  const totalCFPlan = cashflow.reduce((s, r) => s + r.planned, 0)
  const totalCFAct  = cashflow.reduce((s, r) => s + r.actual, 0)
  const lastCF      = cashflow[cashflow.length - 1]

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* ── Project header ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-black tracking-[-0.4px]">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#6B7280]">
              {project.client     && <span>👤 {project.client}</span>}
              {project.contractor && <span>🏗 {project.contractor}</span>}
              {project.location   && <span>📍 {project.location}</span>}
              <span>🏷 {PROJECT_TYPE_LABELS[project.projectType]}</span>
            </div>
            {project.contractStartDate && project.contractEndDate && (
              <p className="text-[12px] text-[#6B7280] mt-2">
                {project.contractStartDate} → {project.contractEndDate}
                {days !== null && (
                  <span className={`ml-2 font-semibold ${days < 0 ? 'text-red-600' : days < 30 ? 'text-orange-600' : 'text-[#6B7280]'}`}>
                    ({days >= 0 ? `${days} days left` : `${Math.abs(days)} days overdue`})
                  </span>
                )}
              </p>
            )}
            {project.description && <p className="text-[12px] text-[#6B7280] mt-2">{project.description}</p>}
          </div>
          <button
            onClick={() => router.push(`/projects/${projectId}/zones`)}
            className="flex-shrink-0 bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#0F1115] transition-colors"
          >
            Manage Zones →
          </button>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Contract Value"
          value={formatCurrency(project.contractValue, project.currency)}
          sub={project.currency}
        />
        <KpiCard
          label="Network Length"
          value={formatLength(project.totalNetworkLength)}
          sub={`Executed: ${formatLength(project.executedLength || 0)}`}
        />
        <KpiCard
          label="Overall Progress"
          value={`${project.completionPct || 0}%`}
          sub={`${zones.length} zones`}
          accent={project.completionPct >= 80 ? '#22c55e' : project.completionPct >= 40 ? '#f97316' : '#2563FF'}
        />
        <KpiCard
          label="Cash Flow Actual"
          value={formatCurrency(totalCFAct, project.currency)}
          sub={`Planned: ${formatCurrency(totalCFPlan, project.currency)}`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── Zone Progress ───────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-bold text-black uppercase tracking-wider">Zone Progress</h2>
            <button
              onClick={() => router.push(`/projects/${projectId}/zones`)}
              className="text-[11px] text-[#2563FF] hover:underline"
            >
              View all →
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {zones.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-[#6B7280] mb-3">No zones yet</p>
                <button
                  onClick={() => router.push(`/projects/${projectId}/zones`)}
                  className="text-sm font-semibold text-black hover:underline"
                >
                  + Add Zone
                </button>
              </div>
            ) : (
              zones.slice(0, 6).map(zone => (
                <div key={zone.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-medium text-black">{zone.name}</span>
                    <span className="text-[12px] font-bold text-black">{zone.completionPct || 0}%</span>
                  </div>
                  <ProgressBar pct={zone.completionPct || 0} />
                  <div className="flex gap-4 mt-1.5">
                    <span className="text-[10px] text-[#6B7280]">{formatLength(zone.executedLength || 0)} executed</span>
                    <span className="text-[10px] text-[#6B7280]">{formatLength(zone.totalLength || 0)} total</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Activity Summary ─────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-bold text-black uppercase tracking-wider">Activity Breakdown</h2>
            <button
              onClick={() => router.push(`/projects/${projectId}/progress`)}
              className="text-[11px] text-[#2563FF] hover:underline"
            >
              Details →
            </button>
          </div>
          <div className="px-6 py-4 space-y-4">
            {zones.length === 0 ? (
              <p className="text-sm text-[#6B7280] text-center py-4">Add zones and segments to see activity breakdown</p>
            ) : (
              ACTIVITY_KEYS.map(act => {
                // For now show zone-level summary — will be segment-computed in Phase 2
                const pct = project.completionPct || 0
                return (
                  <div key={act.key}>
                    <div className="flex justify-between text-[12px] mb-1.5">
                      <span className="font-medium text-black">{act.label}</span>
                      <span className="text-[#6B7280]">{pct}%</span>
                    </div>
                    <ProgressBar pct={pct} color={act.color} />
                  </div>
                )
              })
            )}
          </div>

          {/* Cash flow mini view */}
          {cashflow.length > 0 && (
            <>
              <div className="border-t border-gray-100 px-6 py-4">
                <div className="text-[13px] font-bold text-black uppercase tracking-wider mb-3">Cash Flow (Last 3 Months)</div>
                <div className="space-y-2">
                  {cashflow.slice(-3).map(r => {
                    const monthLabel = `${MONTH_NAMES[r.month - 1]} ${r.year}`
                    const varPct = r.planned > 0 ? ((r.actual - r.planned) / r.planned * 100).toFixed(1) : '0'
                    const isNeg = r.actual < r.planned
                    return (
                      <div key={r.id} className="flex items-center justify-between text-[12px]">
                        <span className="text-[#6B7280] w-20">{monthLabel}</span>
                        <div className="flex-1 mx-3">
                          <ProgressBar pct={r.planned > 0 ? (r.actual / r.planned) * 100 : 0} color={isNeg ? '#f97316' : '#22c55e'} height={4} />
                        </div>
                        <span className={`font-semibold w-16 text-right ${isNeg ? 'text-orange-600' : 'text-green-600'}`}>
                          {isNeg ? '' : '+'}{varPct}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
