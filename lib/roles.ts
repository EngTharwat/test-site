// ─────────────────────────────────────────────────────────────────────────────
// PMBoards — Role definitions & permission matrix
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'project_manager' | 'site_engineer' | 'surveyor'

export const ROLE_LABELS: Record<Role, string> = {
  admin:           'Admin',
  project_manager: 'Project Manager',
  site_engineer:   'Site Engineer',
  surveyor:        'Surveyor',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin:           'Full access — view and edit everything, manage team',
  project_manager: 'View project overview only, no editing',
  site_engineer:   'View zones & segments, edit progress only',
  surveyor:        'View & edit zones and segments, view map',
}

export const ROLES: Role[] = ['admin', 'project_manager', 'site_engineer', 'surveyor']

// ── Permission flags ──────────────────────────────────────────────────────────
export interface Permissions {
  canViewPortfolio: boolean   // dashboard / project list
  canEditProject:   boolean   // create / edit / delete a project
  canViewOverview:  boolean   // project overview page
  canViewZones:     boolean
  canEditZones:     boolean
  canViewSegments:  boolean
  canEditSegments:  boolean   // structural: zoneId, length, diameter …
  canViewProgress:  boolean
  canEditProgress:  boolean   // activity actualQty / pct updates
  canViewCashFlow:  boolean
  canEditCashFlow:  boolean
  canViewMap:       boolean
  canManageTeam:    boolean
}

// ── Matrix ────────────────────────────────────────────────────────────────────
export const PERMISSIONS: Record<Role, Permissions> = {
  admin: {
    canViewPortfolio: true,  canEditProject:  true,
    canViewOverview:  true,
    canViewZones:     true,  canEditZones:    true,
    canViewSegments:  true,  canEditSegments: true,
    canViewProgress:  true,  canEditProgress: true,
    canViewCashFlow:  true,  canEditCashFlow: true,
    canViewMap:       true,  canManageTeam:   true,
  },
  project_manager: {
    canViewPortfolio: true,  canEditProject:  false,
    canViewOverview:  true,
    canViewZones:     false, canEditZones:    false,
    canViewSegments:  false, canEditSegments: false,
    canViewProgress:  false, canEditProgress: false,
    canViewCashFlow:  false, canEditCashFlow: false,
    canViewMap:       false, canManageTeam:   false,
  },
  site_engineer: {
    canViewPortfolio: false, canEditProject:  false,
    canViewOverview:  true,
    canViewZones:     true,  canEditZones:    false,
    canViewSegments:  true,  canEditSegments: false,
    canViewProgress:  true,  canEditProgress: true,
    canViewCashFlow:  false, canEditCashFlow: false,
    canViewMap:       false, canManageTeam:   false,
  },
  surveyor: {
    canViewPortfolio: false, canEditProject:  false,
    canViewOverview:  true,
    canViewZones:     true,  canEditZones:    true,
    canViewSegments:  true,  canEditSegments: true,
    canViewProgress:  false, canEditProgress: false,
    canViewCashFlow:  false, canEditCashFlow: false,
    canViewMap:       true,  canManageTeam:   false,
  },
}

export function can(role: Role | null | undefined, perm: keyof Permissions): boolean {
  if (!role) return false
  return PERMISSIONS[role]?.[perm] ?? false
}
