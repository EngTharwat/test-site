'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import {
  Project, ProjectStatus, STATUS_LABELS, STATUS_COLORS,
  PROJECT_TYPE_LABELS, formatCurrency, formatLength,
} from '@/lib/types'

function StatusBadge({ status }: { status: ProjectStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function ProgressBar({ pct, color = '#2563FF' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

export default function PortfolioDashboard() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.get('/api/projects')
      setProjects(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // ── Portfolio KPIs ──────────────────────────────────────────
  const totalValue    = projects.reduce((s, p) => s + (p.contractValue || 0), 0)
  const active        = projects.filter(p => p.status === 'active').length
  const avgCompletion = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.completionPct || 0), 0) / projects.length)
    : 0
  const totalLength   = projects.reduce((s, p) => s + (p.totalNetworkLength || 0), 0)

  const kpis = [
    { label: 'Total Projects',    value: projects.length.toString(),  sub: `${active} active` },
    { label: 'Total Contract Value', value: formatCurrency(totalValue, 'SAR'), sub: 'across portfolio' },
    { label: 'Total Network Length', value: formatLength(totalLength),  sub: 'all projects' },
    { label: 'Avg. Completion',   value: `${avgCompletion}%`,          sub: 'portfolio progress' },
  ]

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-[-0.5px]">Portfolio</h1>
          <p className="text-sm text-[#6B7280] mt-1">All active and planned projects</p>
        </div>
        <button
          onClick={() => router.push('/projects/new')}
          className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Project
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">{k.label}</div>
            <div className="text-2xl font-bold text-black tracking-[-0.5px]">{k.value}</div>
            <div className="text-[11px] text-[#6B7280] mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg mb-6">{error}</p>}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-6" />
              <div className="h-2 bg-gray-100 rounded mb-4" />
              <div className="flex gap-4">
                <div className="h-3 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-4xl mb-4">📋</div>
          <h3 className="text-lg font-semibold text-black mb-2">No projects yet</h3>
          <p className="text-sm text-[#6B7280] mb-6">Create your first sewer network project to get started.</p>
          <button
            onClick={() => router.push('/projects/new')}
            className="bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0F1115] transition-colors"
          >
            + New Project
          </button>
        </div>
      )}

      {/* Projects grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => {
            const days = p.contractEndDate
              ? Math.ceil((new Date(p.contractEndDate).getTime() - Date.now()) / 86_400_000)
              : null

            return (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}`)}
                className="bg-white rounded-xl p-6 border border-gray-200 text-left hover:border-black hover:shadow-sm transition-all group"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="font-semibold text-black text-[15px] leading-tight group-hover:text-[#2563FF] transition-colors">
                    {p.name}
                  </h3>
                  <StatusBadge status={p.status} />
                </div>

                {/* Client + type */}
                <p className="text-[12px] text-[#6B7280] mb-4">
                  {p.client} · {PROJECT_TYPE_LABELS[p.projectType]}
                </p>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex justify-between text-[11px] text-[#6B7280] mb-1.5">
                    <span>Overall Progress</span>
                    <span className="font-semibold text-black">{p.completionPct || 0}%</span>
                  </div>
                  <ProgressBar pct={p.completionPct || 0} />
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                  <div>
                    <div className="text-[10px] text-[#6B7280] uppercase tracking-wide">Contract Value</div>
                    <div className="text-[13px] font-semibold text-black mt-0.5">
                      {formatCurrency(p.contractValue, p.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#6B7280] uppercase tracking-wide">Network Length</div>
                    <div className="text-[13px] font-semibold text-black mt-0.5">
                      {formatLength(p.totalNetworkLength || 0)}
                    </div>
                  </div>
                  {days !== null && (
                    <div className="col-span-2 pt-2 border-t border-gray-100">
                      <div className="text-[10px] text-[#6B7280] uppercase tracking-wide">
                        {days >= 0 ? `${days} days remaining` : `${Math.abs(days)} days overdue`}
                      </div>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
