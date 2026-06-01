'use client'

// This file is imported with ssr:false — safe to use window/document
import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
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
  fitNonce: number   // bump to re-fit the map to the segments on demand
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
// Reports the live zoom so line width & node radius can scale with the map,
// keeping them a constant size relative to the ground instead of the screen.
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap()
  useEffect(() => { onZoom(map.getZoom()) }, [map, onZoom])
  // Update only after the zoom animation settles. Updating on every "zoom"
  // tick re-renders the SVG paths mid-animation and makes them appear to
  // drift; "zoomend" keeps them anchored to their coordinates.
  useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  return null
}

// Map a zoom level to a pixel width that represents a constant ground size.
// Each +1 zoom doubles the map scale, so the pixel size doubles too.
const BASE_ZOOM = 16   // reference zoom
const BASE_PX   = 6    // line width (px) at BASE_ZOOM
function weightForZoom(zoom: number): number {
  const w = BASE_PX * Math.pow(2, zoom - BASE_ZOOM)
  return Math.max(2, Math.min(w, 160))   // clamp so it never vanishes or overwhelms
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────
// Re-fits whenever the segment set changes OR fitNonce is bumped (Fit button).
function FitBounds({ mapped, fitNonce }: { mapped: MappedSegment[]; fitNonce: number }) {
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
  }, [mapped, map, fitNonce])
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
export default function LeafletMap({ mapped, isDark, onSelect, selected, fitNonce }: Props) {
  // Default center: Saudi Arabia
  const defaultCenter: [number, number] = [24.68, 46.72]

  // Live zoom → drives line width & node radius (constant size vs. the map)
  const [zoom, setZoom] = useState(12)
  const lineWeight = weightForZoom(zoom)
  const nodeRadius = lineWeight   // node radius matches the line width

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  const tileAttrib = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

  return (
    <MapContainer
      center={defaultCenter}
      zoom={12}
      style={{ width: '100%', height: '100%', background: isDark ? '#1a1a2e' : '#e8f4f8' }}
    >
      <TileLayer url={tileUrl} attribution={tileAttrib} />
      <ZoomWatcher onZoom={setZoom} />
      {mapped.length > 0 && <FitBounds mapped={mapped} fitNonce={fitNonce} />}

      {mapped.map(seg => {
        const start: [number, number] = [seg.startLat!, seg.startLng!]
        const end:   [number, number] = [seg.endLat!,   seg.endLng!]
        const color  = seg.zoneColor
        const weight = selected?.id === seg.id ? lineWeight * 2 : lineWeight
        const opacity = selected && selected.id !== seg.id ? 0.4 : 1

        return (
          <Polyline
            key={seg.id}
            positions={[start, end]}
            pathOptions={{ color, weight, opacity }}
            eventHandlers={{ click: () => onSelect(seg) }}
          >
            {/* Hover tooltip — quick properties without clicking */}
            <Tooltip sticky direction="top" offset={[0, -4]}>
              <div style={{ fontFamily: 'sans-serif', fontSize: 12, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700 }}>{seg.lineNumber || '—'}</div>
                <div style={{ color: '#6b7280' }}>
                  {seg.zoneName}{seg.zoneType ? ` — ${seg.zoneType}` : ''}
                </div>
                <div>{seg.fromMH} → {seg.toMH}</div>
                <div>Ø {seg.diameter} mm · {seg.length} m · {seg.material}</div>
                <div>
                  {seg.surfaceType === 'asphalt' || (seg.asphaltThickness ?? 0) > 0 ? 'Asphalt' : 'Dirt'}
                  {' · '}{seg.overallPct ?? 0}% done
                </div>
              </div>
            </Tooltip>
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

      {/* A node at BOTH the start and end of every segment */}
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
