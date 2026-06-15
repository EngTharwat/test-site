// ─────────────────────────────────────────────────────────────────────────────
// PMBoards — Per-member granular permission model
// Replaces the fixed 4-role system (admin / project_manager / site_engineer / surveyor)
// ─────────────────────────────────────────────────────────────────────────────

export type PageAccess = 'none' | 'view' | 'edit'
export type MapAccess  = 'none' | 'view'

export interface PagePermissions {
  overview:  PageAccess
  zones:     PageAccess
  segments:  PageAccess
  progress:  PageAccess
  permits:   PageAccess
  cash_flow: PageAccess
  boq:       PageAccess
  map:       MapAccess
}

/**
 * Stored on each non-admin member document in Firestore under the `permissions` key.
 *
 * project_scope = 'all':
 *   page_permissions is a flat PagePermissions object applied to ALL projects.
 *   project_ids is null.
 *
 * project_scope = 'specific':
 *   project_ids lists the allowed project IDs.
 *   page_permissions is a Record<projectId, PagePermissions>.
 */
export interface MemberPermissions {
  project_scope:    'all' | 'specific'
  project_ids:      string[] | null
  page_permissions: PagePermissions | Record<string, PagePermissions>
}

export const DEFAULT_PAGE_PERMISSIONS: PagePermissions = {
  overview: 'none', zones: 'none', segments: 'none',
  progress: 'none', permits: 'none', cash_flow: 'none', boq: 'none', map: 'none',
}

/** Human-readable label for each page. */
export const PAGE_LABELS: Record<keyof PagePermissions, string> = {
  overview:  'Overview',
  zones:     'Zones',
  segments:  'Segments',
  progress:  'Progress',
  permits:   'Permits',
  cash_flow: 'Cash Flow',
  boq:       'BOQ',
  map:       'Map / GIS',
}

/** Pages that support the 'edit' access level (map is view-only). */
export const EDITABLE_PAGES = ['overview', 'zones', 'segments', 'progress', 'permits', 'cash_flow', 'boq'] as const
export type EditablePage = (typeof EDITABLE_PAGES)[number]

/** All pages in display order. */
export const ALL_PAGES: (keyof PagePermissions)[] = [
  'overview', 'zones', 'boq', 'segments', 'progress', 'permits', 'cash_flow', 'map',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Whether a member is allowed to access a specific project at all. */
export function canAccessProject(
  permissions: MemberPermissions,
  projectId: string,
): boolean {
  if (permissions.project_scope === 'all') return true
  return (permissions.project_ids ?? []).includes(projectId)
}

/**
 * Resolve the PagePermissions that apply to a member for a given project.
 * Falls back to all-none if the project isn't found in per-project permissions.
 */
export function getProjectPagePermissions(
  permissions: MemberPermissions,
  projectId: string,
): PagePermissions {
  if (permissions.project_scope === 'all') {
    return permissions.page_permissions as PagePermissions
  }
  const byProject = permissions.page_permissions as Record<string, PagePermissions>
  return byProject[projectId] ?? { ...DEFAULT_PAGE_PERMISSIONS }
}

/** True if the member can view (or edit) a given page for a given project. */
export function canViewPage(
  permissions: MemberPermissions | null | undefined,
  projectId: string,
  page: keyof PagePermissions,
): boolean {
  if (!permissions) return false
  if (!canAccessProject(permissions, projectId)) return false
  // Missing keys (e.g. a page added after a member was created) default to 'none'.
  return (getProjectPagePermissions(permissions, projectId)[page] ?? 'none') !== 'none'
}

/** True if the member can edit a given page for a given project. */
export function canEditPage(
  permissions: MemberPermissions | null | undefined,
  projectId: string,
  page: EditablePage,
): boolean {
  if (!permissions) return false
  if (!canAccessProject(permissions, projectId)) return false
  return getProjectPagePermissions(permissions, projectId)[page] === 'edit'
}

/** One-line summary for display in the members table. */
export function permissionsSummary(permissions: MemberPermissions): string {
  const scopePart =
    permissions.project_scope === 'all'
      ? 'All projects'
      : `${(permissions.project_ids ?? []).length} project${(permissions.project_ids ?? []).length !== 1 ? 's' : ''}`

  let sample: PagePermissions
  if (permissions.project_scope === 'all') {
    sample = permissions.page_permissions as PagePermissions
  } else {
    const firstId = (permissions.project_ids ?? [])[0]
    const byProject = permissions.page_permissions as Record<string, PagePermissions>
    sample = firstId ? (byProject[firstId] ?? DEFAULT_PAGE_PERMISSIONS) : DEFAULT_PAGE_PERMISSIONS
  }

  const accessible = ALL_PAGES.filter(p => sample[p] !== 'none')
  if (accessible.length === 0) return `${scopePart} · No access`
  return `${scopePart} · ${accessible.map(p => PAGE_LABELS[p]).join(', ')}`
}
