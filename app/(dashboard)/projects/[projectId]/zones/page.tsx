'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Zone, ZoneStatus, formatLength } from '@/lib/types'

const ZONE_STATUS_LABELS: Record<ZoneStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed:   'Completed',
}
const ZONE_STATUS_COLORS: Record<ZoneStatus, string> = {
  not_started: 'text-gray-500 bg-gray-100',
  in_progress: 'text-orange-700 bg-orange-100',
  completed:   'text-green-700 bg-green-100',
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f97316' : '#2563FF'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="text-[11px] font-semibold text-black w-9 text-right">{pct}%</span>
    </div>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors placeholder:text-gray-400'

export default function ZonesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()

  const [zones,    setZones]   = useState<Zone[]>([])
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState('')
  const [showForm, setShowForm]= useState(false)
  const [saving,   setSaving]  = useState(false)
  const [editZone, setEditZone]= useState<Zone | null>(null)

  const [form, setForm] = useState({
    name: '', description: '', totalLength: '', executedLength: '', status: 'not_started' as ZoneStatus,
  })

  const resetForm = () => setForm({ name: '', description: '', totalLength: '', executedLength: '', status: 'not_started' })

  const fetchZones = useCallback(async () => {
    try {
      const data = await api.get(`/api/projects/${projectId}/zones`)
      setZones(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load zones')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchZones() }, [fetchZones])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        name:           form.name.trim(),
        description:    form.description.trim(),
        totalLength:    Number(form.totalLength) || 0,
        executedLength: Number(form.executedLength) || 0,
        status:         form.status,
      }
      if (editZone) {
        const updated = await api.patch(`/api/projects/${projectId}/zones/${editZone.id}`, body)
        setZones(prev => prev.map(z => z.id === editZone.id ? updated : z))
      } else {
        const zone = await api.post(`/api/projects/${projectId}/zones`, body)
        setZones(prev => [zone, ...prev])
      }
      resetForm()
      setShowForm(false)
      setEditZone(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save zone')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(zone: Zone) {
    setEditZone(zone)
    setForm({
      name:           zone.name,
      description:    zone.description || '',
      totalLength:    String(zone.totalLength),
      executedLength: String(zone.executedLength),
      status:         zone.status,
    })
    setShowForm(true)
  }

  async function deleteZone(zoneId: string) {
    if (!confirm('Delete this zone? This cannot be undone.')) return
    try {
      await api.delete(`/api/projects/${projectId}/zones/${zoneId}`)
      setZones(prev => prev.filter(z => z.id !== zoneId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete zone')
    }
  }

  // Summary stats
  const totalLen    = zones.reduce((s, z) => s + (z.totalLength || 0), 0)
  const executedLen = zones.reduce((s, z) => s + (z.executedLength || 0), 0)
  const avgCompl    = zones.length ? Math.round(zones.reduce((s, z) => s + (z.completionPct || 0), 0) / zones.length) : 0

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)} className="text-[12px] text-[#6B7280] hover:text-black mb-1 flex items-center gap-1 transition-colors">← Overview</button>
          <h1 className="text-2xl font-bold text-black tracking-[-0.5px]">Zone Management</h1>
          <p className="text-sm text-[#6B7280] mt-1">Divide the network into manageable construction zones</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditZone(null); setShowForm(v => !v) }}
          className="bg-black text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] transition-colors"
        >
          + Add Zone
        </button>
      </div>

      {/* Summary row */}
      {zones.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Length',    value: formatLength(totalLen) },
            { label: 'Executed Length', value: formatLength(executedLen) },
            { label: 'Avg. Completion', value: `${avgCompl}%` },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl px-5 py-4 border border-gray-200 text-center">
              <div className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-1">{k.label}</div>
              <div className="text-xl font-bold text-black">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black uppercase tracking-wider mb-4">
            {editZone ? 'Edit Zone' : 'New Zone'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Zone Name *</label>
              <input className={inputCls} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Zone A — Northern Sector" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Status</label>
              <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ZoneStatus }))}>
                {(Object.keys(ZONE_STATUS_LABELS) as ZoneStatus[]).map(s => (
                  <option key={s} value={s}>{ZONE_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Total Length (m)</label>
              <input className={inputCls} type="number" min="0" step="0.01" value={form.totalLength} onChange={e => setForm(f => ({ ...f, totalLength: e.target.value }))} placeholder="e.g. 3500" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Executed Length (m)</label>
              <input className={inputCls} type="number" min="0" step="0.01" value={form.executedLength} onChange={e => setForm(f => ({ ...f, executedLength: e.target.value }))} placeholder="e.g. 1200" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Description</label>
              <input className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of this zone" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving} className="bg-black text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editZone ? 'Update Zone' : 'Add Zone'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditZone(null); resetForm() }} className="text-sm text-[#6B7280] hover:text-black transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : zones.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-3xl mb-3">🗺</div>
          <p className="text-sm font-semibold text-black mb-1">No zones yet</p>
          <p className="text-[12px] text-[#6B7280]">Divide your project into geographical zones to track progress.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_100px_100px_120px_80px] gap-4 px-6 py-3 bg-[#F3F4F6] border-b border-gray-200 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
            <span>Zone</span>
            <span className="text-right">Total</span>
            <span className="text-right">Executed</span>
            <span className="text-right">Remaining</span>
            <span>Progress</span>
            <span></span>
          </div>

          <div className="divide-y divide-gray-50">
            {zones.map(zone => (
              <div key={zone.id} className="grid grid-cols-[1fr_100px_100px_100px_120px_80px] gap-4 items-center px-6 py-4 hover:bg-[#F9FAFB] transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-black">{zone.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${ZONE_STATUS_COLORS[zone.status]}`}>
                      {ZONE_STATUS_LABELS[zone.status]}
                    </span>
                  </div>
                  {zone.description && <p className="text-[11px] text-[#6B7280] mt-0.5">{zone.description}</p>}
                </div>
                <span className="text-right text-[12px] text-[#374151] font-medium">{(zone.totalLength || 0).toLocaleString()} m</span>
                <span className="text-right text-[12px] text-[#374151] font-medium">{(zone.executedLength || 0).toLocaleString()} m</span>
                <span className="text-right text-[12px] text-[#374151] font-medium">{(zone.remainingLength || 0).toLocaleString()} m</span>
                <ProgressBar pct={zone.completionPct || 0} />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => openEdit(zone)} className="text-[11px] text-[#6B7280] hover:text-black transition-colors">Edit</button>
                  <button onClick={() => deleteZone(zone.id)} className="text-[11px] text-red-400 hover:text-red-600 transition-colors">Del</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
