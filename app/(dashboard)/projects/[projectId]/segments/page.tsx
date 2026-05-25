'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Segment, Zone, PIPE_MATERIALS, ACTIVITY_KEYS, fmtN } from '@/lib/types'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors placeholder:text-gray-400'

function ActivityBadge({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="h-1 w-10 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="text-[9px] text-[#6B7280]">{pct}%</span>
    </div>
  )
}

const emptyForm = {
  zoneId: '', lineNumber: '', fromMH: '', toMH: '',
  diameter: '', length: '', material: 'uPVC',
  startLat: '', startLng: '', endLat: '', endLng: '',
}

export default function SegmentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()

  const [segments,     setSegments]     = useState<Segment[]>([])
  const [zones,        setZones]        = useState<Zone[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [showForm,     setShowForm]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [filterZone,   setFilterZone]   = useState('')
  const [editSegment,  setEditSegment]  = useState<Segment | null>(null)

  const [form, setForm] = useState(emptyForm)

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
      startLat:   seg.startLat != null ? String(seg.startLat) : '',
      startLng:   seg.startLng != null ? String(seg.startLng) : '',
      endLat:     seg.endLat   != null ? String(seg.endLat)   : '',
      endLng:     seg.endLng   != null ? String(seg.endLng)   : '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteSeg(segId: string) {
    if (!confirm('Delete this segment? This cannot be undone.')) return
    try {
      await api.delete(`/api/projects/${projectId}/segments/${segId}`)
      setSegments(prev => prev.filter(s => s.id !== segId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete segment')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.zoneId) { setError('Please select a zone'); return }
    setSaving(true); setError('')
    const len = Number(form.length) || 0

    const body = {
      zoneId:     form.zoneId,
      lineNumber: form.lineNumber.trim(),
      fromMH:     form.fromMH.trim(),
      toMH:       form.toMH.trim(),
      diameter:   Number(form.diameter) || 0,
      length:     len,
      material:   form.material,
      startLat:   form.startLat ? Number(form.startLat) : null,
      startLng:   form.startLng ? Number(form.startLng) : null,
      endLat:     form.endLat   ? Number(form.endLat)   : null,
      endLng:     form.endLng   ? Number(form.endLng)   : null,
    }

    try {
      if (editSegment) {
        const updated = await api.patch(`/api/projects/${projectId}/segments/${editSegment.id}`, body)
        setSegments(prev => prev.map(s => s.id === editSegment.id ? updated : s))
      } else {
        const defaultActivity = (qty: number) => ({ plannedQty: qty, actualQty: 0, pct: 0, status: 'not_started' })
        const seg = await api.post(`/api/projects/${projectId}/segments`, {
          ...body,
          excavation:  defaultActivity(len),
          piping:      defaultActivity(len),
          backfilling: defaultActivity(len),
          basecourse:  defaultActivity(len),
          asphalt:     defaultActivity(len),
          overallPct:  0,
          status:      'not_started',
        })
        setSegments(prev => [seg, ...prev])
      }
      setForm(emptyForm)
      setShowForm(false)
      setEditSegment(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save segment')
    } finally {
      setSaving(false)
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const displayed = filterZone ? segments.filter(s => s.zoneId === filterZone) : segments
  const zoneMap   = Object.fromEntries(zones.map(z => [z.id, z.name]))
  const totalLen  = displayed.reduce((s, seg) => s + (seg.length || 0), 0)

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)} className="text-[12px] text-[#6B7280] hover:text-black mb-1 flex items-center gap-1 transition-colors">← Overview</button>
          <h1 className="text-2xl font-bold text-black tracking-[-0.5px]">Network Segments</h1>
          <p className="text-sm text-[#6B7280] mt-1">Individual pipe segments with engineering data and activity progress</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setEditSegment(null); setShowForm(v => !v) }}
          className="bg-black text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] transition-colors"
        >
          + Add Segment
        </button>
      </div>

      {/* Filter + stats */}
      <div className="flex items-center gap-4 mb-6">
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-black" value={filterZone} onChange={e => setFilterZone(e.target.value)}>
          <option value="">All Zones ({segments.length})</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.name} ({segments.filter(s => s.zoneId === z.id).length})</option>)}
        </select>
        <span className="text-[12px] text-[#6B7280]">
          {displayed.length} segments · {fmtN(totalLen, 1)} m total
        </span>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black uppercase tracking-wider mb-4">
            {editSegment ? 'Edit Segment' : 'New Pipe Segment'}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2 md:col-span-4">
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Zone *</label>
              <select className={inputCls} value={form.zoneId} onChange={set('zoneId')} required>
                <option value="">— Select Zone —</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Line No.</label>
              <input className={inputCls} value={form.lineNumber} onChange={set('lineNumber')} placeholder="L-001" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">From MH</label>
              <input className={inputCls} value={form.fromMH} onChange={set('fromMH')} placeholder="MH-01" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">To MH</label>
              <input className={inputCls} value={form.toMH} onChange={set('toMH')} placeholder="MH-02" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Diameter (mm)</label>
              <input className={inputCls} type="number" min="0" value={form.diameter} onChange={set('diameter')} placeholder="300" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Length (m) *</label>
              <input className={inputCls} type="number" min="0" step="0.01" value={form.length} onChange={set('length')} placeholder="45.5" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Material</label>
              <select className={inputCls} value={form.material} onChange={set('material')}>
                {PIPE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Start Lat</label>
              <input className={inputCls} type="number" step="any" value={form.startLat} onChange={set('startLat')} placeholder="24.123456" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Start Lng</label>
              <input className={inputCls} type="number" step="any" value={form.startLng} onChange={set('startLng')} placeholder="46.789012" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">End Lat</label>
              <input className={inputCls} type="number" step="any" value={form.endLat} onChange={set('endLat')} placeholder="24.123789" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">End Lng</label>
              <input className={inputCls} type="number" step="any" value={form.endLng} onChange={set('endLng')} placeholder="46.789345" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving} className="bg-black text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editSegment ? 'Update Segment' : 'Add Segment'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditSegment(null); setForm(emptyForm) }} className="text-sm text-[#6B7280] hover:text-black transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 rounded-xl animate-pulse" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-3xl mb-3">🔧</div>
          <p className="text-sm font-semibold text-black mb-1">No segments yet</p>
          <p className="text-[12px] text-[#6B7280]">Add pipe segments with their engineering data and GIS coordinates.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#F3F4F6] border-b border-gray-200">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Zone</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Line</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">MH From → To</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Ø (mm)</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Length (m)</th>
                <th className="px-4 py-3 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Material</th>
                {ACTIVITY_KEYS.map(a => (
                  <th key={a.key} className="px-2 py-3 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider text-center">{a.label.slice(0,4)}</th>
                ))}
                <th className="text-right px-4 py-3 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Overall</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayed.map(seg => (
                <tr key={seg.id} className="hover:bg-[#F9FAFB] transition-colors">
                  <td className="px-4 py-3 text-[#374151]">{zoneMap[seg.zoneId] || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-black">{seg.lineNumber || '—'}</td>
                  <td className="px-4 py-3 text-[#374151]">{seg.fromMH} → {seg.toMH}</td>
                  <td className="px-4 py-3 text-right text-[#374151]">{fmtN(seg.diameter)}</td>
                  <td className="px-4 py-3 text-right font-medium text-black">{fmtN(seg.length, 1)}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-100 text-[#374151] text-[10px] font-semibold px-1.5 py-0.5 rounded">{seg.material}</span>
                  </td>
                  {ACTIVITY_KEYS.map(a => (
                    <td key={a.key} className="px-2 py-3">
                      <ActivityBadge pct={(seg as any)[a.key]?.pct || 0} color={a.color} />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-bold text-black">{seg.overallPct || 0}%</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2.5 justify-end whitespace-nowrap">
                      <button onClick={() => openEdit(seg)} className="text-[11px] text-[#6B7280] hover:text-black transition-colors">Edit</button>
                      <button onClick={() => deleteSeg(seg.id)} className="text-[11px] text-red-400 hover:text-red-600 transition-colors">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="bg-[#F3F4F6] border-t-2 border-gray-200">
                <td colSpan={4} className="px-4 py-3 text-[11px] font-bold text-black uppercase tracking-wider">
                  Total ({displayed.length} segments)
                </td>
                <td className="px-4 py-3 text-right text-[12px] font-bold text-black">{fmtN(totalLen, 1)}</td>
                <td colSpan={7} />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
