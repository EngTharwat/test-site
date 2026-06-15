'use client'

// This file is imported with ssr:false — safe to use window/document
import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Segment, Zone, FacilityShape } from '@/lib/types'
import { zoneHasManholes, DEFAULT_MAP_STYLE } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MappedSegment extends Segment {
  zoneName:  string
  zoneType:  string
  zoneColor: string
}

// Non-linear point facility (pump station, reservoir…) drawn as a square.
export interface MappedFacility {
  id: string; name: string; type: string; lat: number; lng: number; color: string
}

interface Props {
  mapped:     MappedSegment[]
  facilities: MappedFacility[]
  isDark:     boolean
  onSelect:   (seg: MappedSegment | null) => void
  selected:   MappedSegment | null
  fitNonce:   number   // bump to re-fit the map to the segments on demand
  // Shared display style (set by editors). Falls back to the defaults.
  lineWeight?:    number
  facilityShape?: FacilityShape
  facilitySize?:  number
}

// Inner SVG shape for a facility marker, drawn in a `size`×`size` viewBox.
function facilityShapeSvg(shape: FacilityShape, color: string): string {
  const fill = `fill="${color}"`, stroke = 'stroke="#fff" stroke-width="1.5"'
  switch (shape) {
    case 'square':
      return `<rect x="3" y="3" width="18" height="18" rx="2" ${fill} ${stroke}/>`
    case 'circle':
      return `<circle cx="12" cy="12" r="9" ${fill} ${stroke}/>`
    case 'triangle':
      return `<path d="M12 3 L21 20 L3 20 Z" ${fill} ${stroke} stroke-linejoin="round"/>`
    case 'diamond':
      return `<path d="M12 2 L22 12 L12 22 L2 12 Z" ${fill} ${stroke} stroke-linejoin="round"/>`
    case 'building':
    default:
      return `<rect x="4" y="3" width="16" height="19" rx="1.5" ${fill} ${stroke}/>
        <rect x="7.5" y="6.5" width="3" height="3" rx="0.5" fill="#fff"/>
        <rect x="13.5" y="6.5" width="3" height="3" rx="0.5" fill="#fff"/>
        <rect x="7.5" y="11.5" width="3" height="3" rx="0.5" fill="#fff"/>
        <rect x="13.5" y="11.5" width="3" height="3" rx="0.5" fill="#fff"/>
        <rect x="10" y="17" width="4" height="5" fill="#fff"/>`
  }
}

// Facility marker — fixed screen size (constant across zoom), colored by type.
function facilityIcon(color: string, shape: FacilityShape, size: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    ${facilityShapeSvg(shape, color)}
  </svg>`
  return divIcon({
    className: '',
    html: `<div style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">${svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
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
function weightForZoom(zoom: number, basePx: number): number {
  const w = basePx * Math.pow(2, zoom - BASE_ZOOM)
  return Math.max(2, Math.min(w, 160))   // clamp so it never vanishes or overwhelms
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────
// Re-fits whenever the segment set changes OR fitNonce is bumped (Fit button).
function FitBounds({ mapped, facilities, fitNonce }: { mapped: MappedSegment[]; facilities: MappedFacility[]; fitNonce: number }) {
  const map = useMap()
  useEffect(() => {
    const lats = [...mapped.flatMap(s => [s.startLat!, s.endLat!]), ...facilities.map(f => f.lat)]
    const lngs = [...mapped.flatMap(s => [s.startLng!, s.endLng!]), ...facilities.map(f => f.lng)]
    if (!lats.length) return
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    if (!isFinite(minLat)) return

    const doFit = () => {
      // The map can be measured before its container reaches full size (it lives
      // in a flex/grid cell, or is freshly remounted). Sync the size first so the
      // computed zoom is correct, then fit.
      map.invalidateSize()
      map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [40, 40], maxZoom: 18 })
    }
    doFit()
    // Re-fit once more after layout settles (handles the initial 0-size case).
    const raf = requestAnimationFrame(doFit)
    const t   = setTimeout(doFit, 250)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [mapped, facilities, map, fitNonce])
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
export default function LeafletMap({
  mapped, facilities, isDark, onSelect, selected, fitNonce,
  lineWeight: baseWeight = DEFAULT_MAP_STYLE.lineWeight,
  facilityShape = DEFAULT_MAP_STYLE.facilityShape,
  facilitySize  = DEFAULT_MAP_STYLE.facilitySize,
}: Props) {
  // Default center: Saudi Arabia
  const defaultCenter: [number, number] = [24.68, 46.72]

  // Live zoom → drives line width & node radius (constant size vs. the map)
  const [zoom, setZoom] = useState(12)
  const lineWeight = weightForZoom(zoom, baseWeight)
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
      {(mapped.length > 0 || facilities.length > 0) && <FitBounds mapped={mapped} facilities={facilities} fitNonce={fitNonce} />}

      {/* Point facilities — squares (pump stations, reservoirs…) */}
      {facilities.map(f => (
        <Marker key={f.id} position={[f.lat, f.lng]} icon={facilityIcon(f.color, facilityShape, facilitySize)}>
          <Tooltip direction="top" offset={[0, -8]}>
            <div style={{ fontFamily: 'sans-serif', fontSize: 12 }}>
              <div style={{ fontWeight: 700 }}>{f.name}</div>
              <div style={{ color: '#6b7280' }}>{f.type}</div>
            </div>
          </Tooltip>
          <Popup>
            <div style={{ minWidth: 150, fontFamily: 'sans-serif', fontSize: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{f.name}</div>
              <div style={{ color: '#6b7280', marginBottom: 2 }}>{f.type} · facility</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{f.lat.toFixed(6)}, {f.lng.toFixed(6)}</div>
            </div>
          </Popup>
        </Marker>
      ))}

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

      {/* Manhole nodes at segment ends — only for gravity networks. Pressurized
          mains (Force Main, transmission/distribution) have no manholes. */}
      {mapped.filter(seg => zoneHasManholes(seg.zoneType)).flatMap(seg => {
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
