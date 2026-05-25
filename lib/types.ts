// ─────────────────────────────────────────────────────────────────────────────
// PMBoards — Core Type Definitions
// Data model designed for Contractor PMO / Sewer Network Projects
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type ProjectType  = 'sewer_network' | 'water_network' | 'storm_drainage' | 'roads' | 'other'
export type Currency     = 'SAR' | 'USD' | 'EUR' | 'AED' | 'EGP'
export type PipeMaterial = 'uPVC' | 'HDPE' | 'RCP' | 'GRP' | 'DI' | 'Steel'
export type ActivityStatus = 'not_started' | 'in_progress' | 'completed' | 'on_hold'
export type ZoneStatus     = 'not_started' | 'in_progress' | 'completed'

export interface FirestoreTimestamp { seconds: number; nanoseconds?: number }

// ── Activity Progress ─────────────────────────────────────────────────────────
// One row of construction progress for a single pipe activity
export interface ActivityProgress {
  plannedQty: number   // metres (= segment length by default)
  actualQty:  number   // metres executed
  pct:        number   // 0–100  =  (actual / planned) * 100
  status:     ActivityStatus
  startDate?:  string  // 'YYYY-MM-DD'
  finishDate?: string
}

// ── Project ───────────────────────────────────────────────────────────────────
export interface Project {
  id:                  string
  userId:              string
  name:                string
  client:              string
  contractor:          string
  consultant:          string
  location:            string
  projectType:         ProjectType
  contractValue:       number    // in selected currency
  currency:            Currency
  totalNetworkLength:  number    // metres — design/contract length
  contractStartDate:   string    // 'YYYY-MM-DD'
  contractEndDate:     string
  status:              ProjectStatus
  description:         string
  // Cached aggregates — updated by write operations
  totalZones:      number
  totalSegments:   number
  executedLength:  number   // metres
  completionPct:   number   // 0–100
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

// ── Zone ─────────────────────────────────────────────────────────────────────
export interface Zone {
  id:              string
  projectId:       string
  name:            string
  description:     string
  totalLength:     number   // metres (sum of segments or manual entry)
  executedLength:  number   // metres (from segments or manual)
  remainingLength: number   // totalLength - executedLength
  completionPct:   number   // 0–100
  status:          ZoneStatus
  segmentCount:    number
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

// ── Network Segment (Pipe) ────────────────────────────────────────────────────
export interface Segment {
  id:         string
  projectId:  string
  zoneId:     string
  lineNumber: string   // e.g. 'L-001'
  fromMH:     string   // From Manhole  e.g. 'MH-01'
  toMH:       string   // To Manhole    e.g. 'MH-02'
  diameter:   number   // mm
  length:     number   // metres
  material:   PipeMaterial
  // GIS coordinates
  startLat?: number
  startLng?: number
  endLat?:   number
  endLng?:   number
  // Construction activities
  excavation:   ActivityProgress
  piping:       ActivityProgress
  backfilling:  ActivityProgress
  basecourse:   ActivityProgress
  asphalt:      ActivityProgress
  // Computed
  overallPct: number        // average of all 5 activities
  status:     ActivityStatus
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────
export interface CashFlowRecord {
  id:        string
  projectId: string
  year:      number
  month:     number    // 1–12
  monthKey:  string    // 'YYYY-MM'  — used for natural sort
  planned:   number    // planned expenditure for this month
  actual:    number    // actual expenditure for this month
}

export interface CashFlowWithComputed extends CashFlowRecord {
  variance:           number   // actual - planned
  cumulativePlanned:  number
  cumulativeActual:   number
}

// ── Label / Color Maps ────────────────────────────────────────────────────────
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  sewer_network:  'Sewer Network',
  water_network:  'Water Network',
  storm_drainage: 'Storm Drainage',
  roads:          'Roads',
  other:          'Other',
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning:  'Planning',
  active:    'Active',
  on_hold:   'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  planning:  { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: '#6B7280' },
  active:    { bg: 'bg-green-100',  text: 'text-green-700',  dot: '#22c55e' },
  on_hold:   { bg: 'bg-orange-100', text: 'text-orange-700', dot: '#f97316' },
  completed: { bg: 'bg-blue-100',   text: 'text-[#2563FF]',  dot: '#2563FF' },
  cancelled: { bg: 'bg-red-100',    text: 'text-red-700',    dot: '#ef4444' },
}

export const ACTIVITY_KEYS = [
  { key: 'excavation',  label: 'Excavation',  color: '#2563FF' },
  { key: 'piping',      label: 'Piping',      color: '#7C3AED' },
  { key: 'backfilling', label: 'Backfilling', color: '#f97316' },
  { key: 'basecourse',  label: 'Basecourse',  color: '#22c55e' },
  { key: 'asphalt',     label: 'Asphalt',     color: '#0F1115' },
] as const

export type ActivityKey = typeof ACTIVITY_KEYS[number]['key']

export const CURRENCIES:      Currency[]     = ['SAR', 'USD', 'EUR', 'AED', 'EGP']
export const PIPE_MATERIALS:   PipeMaterial[] = ['uPVC', 'HDPE', 'RCP', 'GRP', 'DI', 'Steel']
export const PROJECT_STATUSES: ProjectStatus[] = ['planning','active','on_hold','completed','cancelled']
export const PROJECT_TYPES:    ProjectType[]   = ['sewer_network','water_network','storm_drainage','roads','other']

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ───────────────────────────────────────────────────────────────────
export function formatCurrency(value: number, currency: Currency = 'SAR'): string {
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `${currency} ${(value / 1_000).toFixed(0)}K`
  return `${currency} ${value.toLocaleString()}`
}

export function formatLength(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`
  return `${metres.toLocaleString()} m`
}

export function daysRemaining(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000)
}
