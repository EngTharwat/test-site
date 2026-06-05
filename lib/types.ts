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

// Zone type options per project type
export const ZONE_TYPES_BY_PROJECT: Record<ProjectType, string[]> = {
  sewer_network:  ['Gravity', 'Force Main', 'House Connections'],
  water_network:  ['Transmission Main', 'Distribution Line', 'House Connections'],
  storm_drainage: ['Gravity', 'Force Main', 'Detention'],
  roads:          ['Earthworks', 'Subbase', 'Base Course', 'Asphalt', 'Drainage'],
  other:          ['General', 'Type A', 'Type B'],
}

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
  // Dynamic breakdown entries — each row: { type, length } (metres)
  // totalNetworkLength = sum of all breakdown lengths (computed, stored in Firestore)
  breakdownEntries?: Array<{ type: string; length: number }>
  // Legacy fixed fields — kept for backward compatibility only
  gravityLength?:          number
  forcemainLength?:        number
  houseConnectionsLength?: number
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
  id:        string
  projectId: string
  name:      string
  type:      string          // zone type (e.g., "Gravity", "Force Main")
  // Legacy fields kept for backward compatibility with existing documents
  description?:     string
  totalLength?:     number
  executedLength?:  number
  remainingLength?: number
  completionPct?:   number
  status?:          ZoneStatus
  segmentCount?:    number
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

// ── Network Segment (Pipe) ────────────────────────────────────────────────────
export type SurfaceType = 'asphalt' | 'dirt'

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
  // Pavement thicknesses (cm) — 0 means that layer is absent
  basecourseThickness?: number
  asphaltThickness?:    number
  surfaceType?:         SurfaceType   // derived from asphaltThickness
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

// ── Work Permit ─────────────────────────────────────────────────────────────
export type PermitStatus     = 'active' | 'amended' | 'cancelled' | 'cleared' | 'pending'
export type ExcavationStatus = 'not_started' | 'active' | 'cleared'

export interface Permit {
  id:            string
  projectId:     string
  permitNo:      string   // رقم التصريح
  projectName:   string   // اسم المشروع (free text — copied from sheet)
  workOrderNo:   string   // رقم أمر العمل
  serviceAuthority: string // الجهة الخدمية
  amanah:        string   // الأمانة
  municipality:  string   // البلدية
  district:      string   // الحي
  contractor:    string   // المقاول الرئيسي
  consultant:    string   // الاستشاري الرئيسي
  startDate:     string   // تاريخ بدء العمل  'YYYY-MM-DD'
  permitType:    string   // نوع التصريح
  status:        PermitStatus      // حالة التصريح
  excavation:    ExcavationStatus  // حالة الحفرية
  expiryDate:    string   // تاريخ انتهاء التصريح 'YYYY-MM-DD'
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

export const PERMIT_STATUSES: PermitStatus[] = ['pending', 'active', 'amended', 'cleared', 'cancelled']
export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  pending:   'Pending',
  active:    'Active',
  amended:   'Amended',
  cleared:   'Cleared',
  cancelled: 'Cancelled',
}
export const PERMIT_STATUS_COLORS: Record<PermitStatus, { bg: string; text: string }> = {
  pending:   { bg: 'bg-gray-100 dark:bg-gray-800',     text: 'text-gray-600 dark:text-gray-300' },
  active:    { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
  amended:   { bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300' },
  cleared:   { bg: 'bg-cyan-100 dark:bg-cyan-900/30',   text: 'text-cyan-700 dark:text-cyan-300' },
  cancelled: { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-300' },
}

export const EXCAVATION_STATUSES: ExcavationStatus[] = ['not_started', 'active', 'cleared']
export const EXCAVATION_STATUS_LABELS: Record<ExcavationStatus, string> = {
  not_started: 'Not Started',
  active:      'Active',
  cleared:     'Cleared',
}

/** Permit expiry bucket relative to today. */
export type ExpiryState = 'none' | 'expired' | 'soon' | 'valid'
export function permitExpiryState(expiryDate: string, soonDays = 30): ExpiryState {
  if (!expiryDate) return 'none'
  const days = daysRemaining(expiryDate)
  if (days < 0)        return 'expired'
  if (days <= soonDays) return 'soon'
  return 'valid'
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
  { key: 'excavation',  label: 'Excavation',  color: '#ef4444' },  // Red
  { key: 'piping',      label: 'Pipeline',    color: '#2563FF' },  // Blue
  { key: 'backfilling', label: 'Backfilling', color: '#eab308' },  // Yellow
  { key: 'basecourse',  label: 'Base Course', color: '#22c55e' },  // Green
  { key: 'asphalt',     label: 'Asphalt',     color: '#111827' },  // Black
] as const

export type ActivityKey = typeof ACTIVITY_KEYS[number]['key']

export const CURRENCIES:      Currency[]     = ['SAR', 'USD', 'EUR', 'AED', 'EGP']
export const PIPE_MATERIALS:   PipeMaterial[] = ['uPVC', 'HDPE', 'RCP', 'GRP', 'DI', 'Steel']
export const PROJECT_STATUSES: ProjectStatus[] = ['planning','active','on_hold','completed','cancelled']
export const PROJECT_TYPES:    ProjectType[]   = ['sewer_network','water_network','storm_drainage','roads','other']

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a number with thousand-comma separators. decimals = decimal places. */
export function fmtN(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Full currency amount — no K/M abbreviations, always shows Halalas (2 dp). */
export function formatCurrency(value: number, currency: Currency = 'SAR'): string {
  return `${currency} ${fmtN(value, 2)}`
}

export function formatLength(metres: number): string {
  if (metres >= 1000) return `${fmtN(metres / 1000, 2)} km`
  return `${fmtN(metres)} m`
}

export function daysRemaining(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000)
}
