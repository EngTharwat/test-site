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

// Zone type options per project type (includes point facilities like
// Pump/Lift/Booster Stations, Reservoirs, Tanks — see NONLINEAR_ZONE_TYPES).
export const ZONE_TYPES_BY_PROJECT: Record<ProjectType, string[]> = {
  sewer_network:  ['Gravity', 'Force Main', 'House Connections', 'Pump Station', 'Lift Station', 'Chamber'],
  water_network:  ['Transmission Main', 'Distribution Line', 'House Connections', 'Pump Station', 'Booster Station', 'Reservoir', 'Tank'],
  storm_drainage: ['Gravity', 'Force Main', 'Pump Station', 'Detention Basin', 'Outfall'],
  roads:          ['Earthworks', 'Subbase', 'Base Course', 'Asphalt', 'Drainage', 'Box Culvert'],
  other:          ['General', 'Type A', 'Type B', 'Facility'],
}

// Built-in types that are point facilities (a building/structure), not a
// linear run. These default to non-linear: no segments, located by a single
// coordinate, shown on the map as a building. Matched case-insensitively.
export const NONLINEAR_ZONE_TYPES = [
  'Pump Station', 'Lift Station', 'Booster Station', 'Reservoir', 'Tank',
  'Chamber', 'Manhole', 'Detention Basin', 'Outfall', 'Facility', 'Building',
]
const _nlSet = new Set(NONLINEAR_ZONE_TYPES.map(t => t.toLowerCase()))

/** Sensible default for a type's "linear?" flag (user can override). */
export function isLinearTypeDefault(type: string): boolean {
  return !_nlSet.has((type || '').trim().toLowerCase())
}

/** Whether a linear scope's segment endpoints are manholes (→ shown as nodes
 *  on the map). Gravity networks have manholes; pressurized mains (force/
 *  transmission/distribution) and connections do not. */
export function zoneHasManholes(type: string): boolean {
  return /gravity/i.test(type || '')
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
// ── Map display style ──────────────────────────────────────────────────────────
// Shared per-project map styling, set by editors and seen by all viewers.
export type FacilityShape = 'building' | 'square' | 'circle' | 'triangle' | 'diamond'

export interface MapStyle {
  /** Base line thickness (px) at the reference zoom. Lines stay ground-relative,
   *  so this scales with zoom — it just sets how thick they are overall. */
  lineWeight:    number
  /** Marker shape for point facilities (pump stations, reservoirs…). */
  facilityShape: FacilityShape
  /** Facility marker size (px). Fixed on screen — constant across zoom in/out. */
  facilitySize:  number
}

export const DEFAULT_MAP_STYLE: MapStyle = {
  lineWeight:    6,
  facilityShape: 'building',
  facilitySize:  24,
}

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
  // Per-project map display style (line thickness, facility marker shape/size)
  mapStyle?: MapStyle
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

// ── BOQ (Bill of Quantities) ───────────────────────────────────────────────────
/** Trades a BOQ line item can belong to. */
export const BOQ_TRADES = [
  'Civil', 'Mechanical', 'Electrical', 'Instrumentation',
  'HVAC', 'Plumbing', 'Architectural', 'Landscaping', 'Other',
] as const
export type BoqTrade = (typeof BOQ_TRADES)[number]

export interface BoqItem {
  id:          string   // Firestore document id
  projectId:   string
  scope:       string   // mandatory — one of the project's valid scopes
  area?:       string   // a project area (zone name)
  building?:   string
  trade?:      string   // Civil, Mechanical, …
  activity?:   string
  code:        string   // mandatory — the BOQ item "ID" (e.g. C-101)
  description: string   // mandatory
  rate:        number   // mandatory — unit price
  qty:         number   // mandatory — quantity
  // totalPrice is derived (rate × qty) and stored for sorting/summation
  totalPrice:  number
  createdAt?:  FirestoreTimestamp
  updatedAt?:  FirestoreTimestamp
}

// ── Invoice (interim / payment certificate against the BOQ) ────────────────────
/** One BOQ item billed on an invoice. Snapshots the BOQ values so the invoice
 *  stays stable even if the BOQ is edited afterwards. */
export interface InvoiceLine {
  boqId:       string   // reference to the BoqItem
  code:        string   // snapshot of the BOQ "ID"
  description: string
  scope:       string
  area?:       string
  building?:   string
  rate:        number   // snapshot of the BOQ rate
  qty:         number   // quantity billed on THIS invoice
  amount:      number   // rate × qty
}

export interface Invoice {
  id:          string
  projectId:   string
  number:      string    // invoice No.
  date:        string    // 'YYYY-MM-DD'
  notes?:      string
  lines:       InvoiceLine[]
  total:       number    // sum of line amounts
  paid?:       boolean   // whether the invoice has been paid
  paymentDate?: string   // 'YYYY-MM-DD' — when it was paid
  createdAt?:  FirestoreTimestamp
  updatedAt?:  FirestoreTimestamp
}

// ── Zone ─────────────────────────────────────────────────────────────────────
export interface Zone {
  id:        string
  projectId: string
  name:      string
  type:      string          // zone type (e.g., "Gravity", "Force Main", "Pump Station")
  // Linear scopes have pipe/line segments. Non-linear scopes are point
  // facilities (pump station, reservoir…) — no segments, located by lat/lng,
  // drawn on the map as a square. Undefined = legacy linear zone.
  linear?:   boolean
  lat?:      number
  lng?:      number
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
  // Work permit this segment belongs to (one permit per segment)
  permitId?: string
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

// ── Work Permit (منصة بلدي / Balady) ──────────────────────────────────────────
// Status / excavation are stored as the RAW value from Balady (Arabic) so an
// exported permit sheet matches the platform download exactly.
export interface Permit {
  id:               string
  projectId:        string
  permitNo:         string   // رقم التصريح
  projectName:      string   // اسم المشروع
  workOrderNo:      string   // رقم أمر العمل
  serviceAuthority: string   // الجهة الخدمية
  amanah:           string   // الأمانة
  municipality:     string   // البلدية
  district:         string   // الحي
  contractor:       string   // المقاول الرئيسي
  consultant:       string   // الاستشاري الرئيسي
  startDate:        string   // تاريخ بدء العمل
  permitType:       string   // نوع التصريح
  status:           string   // حالة التصريح  (raw text)
  excavation:       string   // حالة الحفرية  (raw text)
  expiryDate:       string   // تاريخ انتهاء التصريح
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

export type PermitLang = 'ar' | 'en'

// Exact Balady column order + Arabic headers (from the platform sheet) with a
// temporary English translation. Single source for the template, export and
// import header-matching, and the bilingual UI. `key` maps to the Permit field.
export const PERMIT_SHEET_COLUMNS: { key: keyof Permit; ar: string; en: string }[] = [
  { key: 'permitNo',         ar: 'رقم التصريح',        en: 'Permit No.' },
  { key: 'projectName',      ar: 'اسم المشروع',        en: 'Project Name' },
  { key: 'workOrderNo',      ar: 'رقم أمر العمل',      en: 'Work Order No.' },
  { key: 'serviceAuthority', ar: 'الجهة الخدمية',      en: 'Service Authority' },
  { key: 'amanah',           ar: 'الأمانة',            en: 'Amanah' },
  { key: 'municipality',     ar: 'البلدية',            en: 'Municipality' },
  { key: 'district',         ar: 'الحي',               en: 'District' },
  { key: 'contractor',       ar: 'المقاول الرئيسي',    en: 'Main Contractor' },
  { key: 'consultant',       ar: 'الاستشاري الرئيسي',  en: 'Main Consultant' },
  { key: 'startDate',        ar: 'تاريخ بدء العمل',    en: 'Work Start Date' },
  { key: 'permitType',       ar: 'نوع التصريح',        en: 'Permit Type' },
  { key: 'status',           ar: 'حالة التصريح',       en: 'Permit Status' },
  { key: 'excavation',       ar: 'حالة الحفرية',       en: 'Excavation Status' },
  { key: 'expiryDate',       ar: 'تاريخ انتهاء التصريح', en: 'Permit Expiry Date' },
]

// Balady excavation-status values — bilingual (provided by the user).
export const EXCAVATION_MAP: { ar: string; en: string }[] = [
  { ar: 'لم يبدأ العمل',                 en: 'Not Started' },
  { ar: 'تجهيز الموقع وإدخال المعدات',   en: 'Site Preparation' },
  { ar: 'بدأ الحفر',                     en: 'Started' },
  { ar: 'إيقاف مؤقت',                    en: 'Temporary Suspension' },
  { ar: 'مستأنف',                        en: 'Resumed' },
  { ar: 'تم التمديد',                    en: 'Extended' },
  { ar: 'انتهت أعمال الحفر',             en: 'Completed' },
  { ar: 'الغاء أعمال الحفر',             en: 'Cancelled' },
  { ar: 'تم إخلاء طرف أعمال الحفر',      en: 'Handed Over' },
]
export const EXCAVATION_SUGGESTIONS_AR = EXCAVATION_MAP.map(e => e.ar)

const _norm = (s: string) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase()

/** Translate a raw excavation value (AR or EN) to the requested language. */
export function excavationLabel(raw: string, lang: PermitLang): string {
  if (!raw) return ''
  const n = _norm(raw)
  const hit = EXCAVATION_MAP.find(e => _norm(e.ar) === n || _norm(e.en) === n)
  return hit ? hit[lang] : raw   // unknown values pass through unchanged
}

/** True when the excavation status means the site was handed over (finished). */
export function isHandedOver(raw: string): boolean {
  const n = _norm(raw)
  return n === _norm('تم إخلاء طرف أعمال الحفر') || n === _norm('Handed Over')
}

/** Colour bucket for an excavation status chip. */
export type ExcavKind = 'done' | 'active' | 'cancelled' | 'idle' | 'other'
export function excavationKind(raw: string): ExcavKind {
  const en = _norm(excavationLabel(raw, 'en'))
  if (en === 'handed over')                              return 'done'
  if (en === 'completed' || en === 'extended')          return 'done'
  if (en === 'cancelled')                                return 'cancelled'
  if (en === 'started' || en === 'resumed' || en === 'site preparation') return 'active'
  if (en === 'not started' || en === 'temporary suspension')             return 'idle'
  return 'other'
}
export const EXCAV_KIND_COLORS: Record<ExcavKind, { bg: string; text: string }> = {
  done:      { bg: 'bg-cyan-100 dark:bg-cyan-900/30',   text: 'text-cyan-700 dark:text-cyan-300' },
  active:    { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
  cancelled: { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-300' },
  idle:      { bg: 'bg-gray-100 dark:bg-gray-800',      text: 'text-gray-600 dark:text-gray-300' },
  other:     { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
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
