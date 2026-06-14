'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { api } from '@/lib/api'
import { Zone, Project, ZONE_TYPES_BY_PROJECT, ProjectType, isLinearTypeDefault } from '@/lib/types'

const CUSTOM = '__custom__'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

const TYPE_COLORS: Record<string, string> = {
  'Gravity':           'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Force Main':        'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'House Connections': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Transmission Main': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Distribution Line': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'Earthworks':        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Subbase':           'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Base Course':       'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Asphalt':           'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'Drainage':          'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'Detention':         'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
}
const typeBadge = (type: string) =>
  TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'

export default function ZonesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const { profile } = useAuth()
  const isAdmin = profile?.isAdmin ?? false
  const canEdit = isAdmin || (profile?.permissions
    ? getProjectPagePermissions(profile.permissions, projectId).zones === 'edit'
    : false)

  const [zones,    setZones]   = useState<Zone[]>([])
  const [project,  setProject] = useState<Project | null>(null)
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState('')
  const [showForm, setShowForm]= useState(false)
  const [saving,   setSaving]  = useState(false)
  const [editZone, setEditZone]= useState<Zone | null>(null)
  const [form, setForm] = useState({
    name: '', type: '', customType: '', linear: true, lat: '', lng: '',
  })

  const fetchAll = useCallback(async () => {
    try {
      const [proj, data] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/projects/${projectId}/zones`),
      ])
      setProject(proj)
      setZones(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load zones')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const projectType = (project?.projectType ?? 'other') as ProjectType
  const typeOptions = ZONE_TYPES_BY_PROJECT[projectType] ?? ZONE_TYPES_BY_PROJECT.other

  function resetForm() { setForm({ name: '', type: '', customType: '', linear: true, lat: '', lng: '' }) }

  // The effective type string (dropdown choice, or the custom text)
  const effectiveType = form.type === CUSTOM ? form.customType.trim() : form.type

  // Choosing a built-in type auto-sets its linear default (user can still toggle)
  function chooseType(value: string) {
    setForm(f => ({
      ...f,
      type: value,
      linear: value === CUSTOM ? f.linear : isLinearTypeDefault(value),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!effectiveType) { setError('Please choose or enter a scope type'); return }
    setSaving(true); setError('')
    try {
      const body = {
        name: form.name.trim(),
        type: effectiveType,
        linear: form.linear,
        lat: !form.linear && form.lat ? Number(form.lat) : null,
        lng: !form.linear && form.lng ? Number(form.lng) : null,
      }
      if (editZone) {
        const updated = await api.patch(`/api/projects/${projectId}/zones/${editZone.id}`, body)
        setZones(prev => prev.map(z => z.id === editZone.id ? updated : z))
      } else {
        const zone = await api.post(`/api/projects/${projectId}/zones`, body)
        setZones(prev => [...prev, zone])
      }
      resetForm(); setShowForm(false); setEditZone(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save zone')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(zone: Zone) {
    setEditZone(zone)
    const known = (ZONE_TYPES_BY_PROJECT[projectType] ?? []).includes(zone.type)
    setForm({
      name: zone.name,
      type: zone.type ? (known ? zone.type : CUSTOM) : '',
      customType: known ? '' : (zone.type ?? ''),
      linear: zone.linear !== false,
      lat: zone.lat != null ? String(zone.lat) : '',
      lng: zone.lng != null ? String(zone.lng) : '',
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

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push(`/projects/${projectId}`)}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
            ← Overview
          </button>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Areas &amp; Scopes</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">
            Group the project into areas — each area can hold several scopes
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { resetForm(); setEditZone(null); setShowForm(v => !v) }}
            className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors"
          >
            + Add Scope
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && canEdit && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">
            {editZone ? 'Edit Scope' : 'New Scope'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Area Name *</label>
              <input
                className={inputCls} required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Zone A — Northern Sector"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Scope / Type *</label>
              <select className={inputCls} required value={form.type} onChange={e => chooseType(e.target.value)}>
                <option value="">— Select Type —</option>
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                <option value={CUSTOM}>Other (custom)…</option>
              </select>
            </div>

            {/* Custom type name */}
            {form.type === CUSTOM && (
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Custom Scope Name *</label>
                <input className={inputCls} required value={form.customType}
                  onChange={e => setForm(f => ({ ...f, customType: e.target.value }))}
                  placeholder="e.g. Siphon Chamber" />
              </div>
            )}

            {/* Linear vs facility */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Scope kind</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, linear: true }))}
                  className={`flex-1 min-w-[160px] text-left px-3 py-2.5 rounded-lg border text-[12px] transition-colors ${
                    form.linear ? 'border-[#2563FF] bg-[#2563FF]/10 text-black dark:text-white'
                                : 'border-gray-200 dark:border-gray-700 text-[#6B7280] dark:text-gray-400 hover:border-gray-400'}`}>
                  <span className="font-semibold">⎯ Linear run</span>
                  <span className="block text-[10px] mt-0.5 opacity-80">Has pipe/line segments (network, force main…)</span>
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, linear: false }))}
                  className={`flex-1 min-w-[160px] text-left px-3 py-2.5 rounded-lg border text-[12px] transition-colors ${
                    !form.linear ? 'border-[#2563FF] bg-[#2563FF]/10 text-black dark:text-white'
                                 : 'border-gray-200 dark:border-gray-700 text-[#6B7280] dark:text-gray-400 hover:border-gray-400'}`}>
                  <span className="font-semibold">▦ Point facility</span>
                  <span className="block text-[10px] mt-0.5 opacity-80">A building/structure — no segments, shown as a square on the map</span>
                </button>
              </div>
            </div>

            {/* Facility coordinates */}
            {!form.linear && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Latitude</label>
                  <input className={inputCls} type="number" step="any" value={form.lat}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="24.123456" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Longitude</label>
                  <input className={inputCls} type="number" step="any" value={form.lng}
                    onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="46.789012" />
                </div>
              </>
            )}
          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editZone ? 'Update Zone' : 'Add Zone'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditZone(null); resetForm() }}
              className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
      ) : zones.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-3xl mb-3">🗺️</div>
          <p className="text-sm font-semibold text-black dark:text-white mb-1">No areas yet</p>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400">
            Group your project into areas — each area can hold several scopes.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="grid grid-cols-[1fr_2fr] gap-4 px-6 py-3 bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">
            <span>Area</span><span>Scopes</span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {/* Group by zone name — same name = one area with multiple scopes */}
            {Object.entries(
              zones.reduce<Record<string, typeof zones>>((acc, z) => {
                ;(acc[z.name] ??= []).push(z); return acc
              }, {})
            ).map(([name, scopeZones]) => (
              <div key={name}
                className="grid grid-cols-[1fr_2fr] gap-4 items-start px-6 py-4 hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 transition-colors">
                <span className="text-[13px] font-semibold text-black dark:text-white">{name}</span>
                <div className="flex flex-col gap-2">
                  {scopeZones.map(zone => (
                    <div key={zone.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {zone.type ? (
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${typeBadge(zone.type)}`}>
                            {zone.type}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#9CA3AF] italic">No scope</span>
                        )}
                        {zone.linear === false && (
                          <span className="text-[10px] font-semibold text-[#6B7280] dark:text-gray-400 inline-flex items-center gap-1">
                            ▦ Facility
                            {zone.lat != null && zone.lng != null && (
                              <span className="font-mono text-[#9CA3AF]">{zone.lat.toFixed(4)}, {zone.lng.toFixed(4)}</span>
                            )}
                          </span>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(zone)}
                            className="text-[11px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">Edit</button>
                          <button onClick={() => deleteZone(zone.id)}
                            className="text-[11px] text-red-400 hover:text-red-600 transition-colors">Del</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 bg-[#F3F4F6] dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
            <span className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">
              {new Set(zones.map(z => z.name)).size} area{new Set(zones.map(z => z.name)).size !== 1 ? 's' : ''} · {zones.length} scope{zones.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
