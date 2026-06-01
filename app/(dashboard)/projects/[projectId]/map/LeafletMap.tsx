'use client'

// This file is imported with ssr:false — safe to use window/document
import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Segment, Zone } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MappedSegment extends Segment {
  zoneName:  string
  zoneType:  string
  zoneColor: string
}

interface Props {
  mapped:   MappedSegment[]
  isDark:   boolean
  onSelect: (seg: MappedSegment | null) => void
  selected: MappedSegment | null
}

// ── Zone type → color map ─────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  'Gravity':           '#2563FF',
  'Force Main':        '#7C3AED',
  'House Connections': '#22c55e',
  'Transmission Main': '#06b6d4',
  'Distribution Line': '#0891b2',
  'Earthworks':        '#d97706',
  'Subbase':           '#f59e0b',
  'Base Course':       '#eab308',
  'Asphalt':           '#374151',
  'Drainage':          '#0284c7',
  'Detention':         '#6366f1',
}
const FALLBACK_COLORS = ['#2563FF','#7C3AED','#22c55e','#f97316','#ef4444','#06b6d4','#d97706']

export function zoneColor(type: string, idx = 0): string {
  return TYPE_COLORS[type] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

// ── Zoom watcher ──────────────────────────────────────────────────────────────
// Reports the live zoom level so line widths can scale with the map, keeping
// each segment a constant real-world width instead of a constant pixel width.
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap()
  useEffect(() => { onZoom(map.getZoom()) }, [map, onZoom])
  useMapEvents({ zoom: () => onZoom(map.getZoom()) })
  return null
}

// Convert a zoom level to a pixel weight that represents a constant ground width.
// Each +1 zoom doubles the map scale, so the pixel width doubles too.
const BASE_ZOOM = 16        // reference zoom
const BASE_PX   = 8 / 3     // line width (px) at BASE_ZOOM
function weightForZoom(zoom: number): number {
  const w = BASE_PX * Math.pow(2, zoom - BASE_ZOOM)
  return Math.max(1, Math.min(w, 96))   // clamp so it never vanishes or overwhelms
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────
function FitBounds({ mapped }: { mapped: MappedSegment[] }) {
  const map = useMap()
  useEffect(() => {
    if (!mapped.length) return
    const lats = mapped.flatMap(s => [s.startLat!, s.endLat!])
    const lngs = mapped.flatMap(s => [s.startLng!, s.endLng!])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    if (isFinite(minLat)) {
      map.fitBounds([[minLat, minLng],[maxLat, maxLng]], { padding: [40, 40] })
    }
  }, [mapped, map])
  return null
}

// ── Activity dots for popup ───────────────────────────────────────────────────
const ACTIVITIES = [
  { key: 'excavation',  label: 'Exc',  color: '#ef4444' },
  { key: 'piping',      label: 'Pipe', color: '#2563FF' },
  { key: 'backfilling', label: 'Back', color: '#eab308' },
  { key: 'basecourse',  label: 'Base', color: '#22c55e' },
  { key: 'asphalt',     label: 'Asp',  color: '#111827' },
]

function ActivityDots({ seg }: { seg: MappedSegment }) {
  return (
    <div style={{ display:'flex', gap:4, marginTop:4 }}>
      {ACTIVITIES.map(a => {
        const done = ((seg as any)[a.key]?.pct ?? 0) >= 100
        return (
          <div key={a.key} title={a.label} style={{
            width: 10, height: 10, borderRadius: '50%',
            background: done ? a.color : 'transparent',
            border: `2px solid ${a.color}`,
            opacity: done ? 1 : 0.4,
          }} />
        )
      })}
    </div>
  )
}

// ── Main map component ────────────────────────────────────────────────────────
export default function LeafletMap({ mapped, isDark, onSelect, selected }: Props) {
  // Default center: Saudi Arabia
  const defaultCenter: [number, number] = [24.68, 46.72]

  // Live zoom → drives the real-world-constant line width
  const [zoom, setZoom] = useState(12)
  const lineWeight = weightForZoom(zoom)
  const nodeRadius = lineWeight * 2   // endpoints are double the line width

  // Esri Dark Gray Canvas (base + reference labels). Esri tiles use {z}/{y}/{x}.
  const esriBase  = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
  const esriRef   = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
  const esriAttr  = 'Tiles &copy; Esri &mdash; Esri, DeLorme, HERE'

  return (
    <MapContainer
      center={defaultCenter}
      zoom={12}
      maxZoom={16}
      style={{ width: '100%', height: '100%', background: '#2b2b2b' }}
    >
      <TileLayer url={esriBase} attribution={esriAttr} maxZoom={16} />
      <TileLayer url={esriRef}  maxZoom={16} />
      <ZoomWatcher onZoom={setZoom} />
      {mapped.length > 0 && <FitBounds mapped={mapped} />}

      {mapped.map(seg => {
        const start: [number, number] = [seg.startLat!, seg.startLng!]
        const end:   [number, number] = [seg.endLat!,   seg.endLng!]
        const color  = seg.zoneColor
        const weight = lineWeight   // constant real-world width (scales with zoom)
        const opacity = selected && selected.id !== seg.id ? 0.4 : 1

        return (
          <Polyline
            key={seg.id}
            positions={[start, end]}
            pathOptions={{ color, weight, opacity }}
            eventHandlers={{ click: () => onSelect(seg) }}
          >
            <Popup>
              <div style={{ minWidth: 180, fontFamily: 'sans-serif', fontSize: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  {seg.lineNumber || '—'}
                </div>
                <div style={{ color: '#6b7280', marginBottom: 2 }}>
                  {seg.zoneName}{seg.zoneType ? ` — ${seg.zoneType}` : ''}
                </div>
                <div style={{ marginBottom: 2 }}>{seg.fromMH} → {seg.toMH}</div>
                <div style={{ marginBottom: 2 }}>
                  Ø {seg.diameter} mm · {seg.length} m · {seg.material}
                </div>
                <div style={{ marginBottom: 2 }}>
                  Surface:{' '}
                  <span style={{ fontWeight: 600 }}>
                    {seg.surfaceType === 'asphalt' || (seg.asphaltThickness ?? 0) > 0 ? 'Asphalt' : 'Dirt'}
                  </span>
                </div>
                <ActivityDots seg={seg} />
              </div>
            </Popup>
          </Polyline>
        )
      })}

      {/* Start AND end node circles — scale with zoom, radius = 2× line width */}
      {mapped.flatMap(seg => {
        const opacity = selected && selected.id !== seg.id ? 0.4 : 1
        const opts = {
          color: seg.zoneColor, fillColor: seg.zoneColor,
          fillOpacity: opacity, opacity, weight: 1,
        }
        return [
          <CircleMarker key={`start-${seg.id}`} center={[seg.startLat!, seg.startLng!]} radius={nodeRadius} pathOptions={opts} />,
          <CircleMarker key={`end-${seg.id}`}   center={[seg.endLat!,   seg.endLng!]}   radius={nodeRadius} pathOptions={opts} />,
        ]
      })}
    </MapContainer>
  )
}
