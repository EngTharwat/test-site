// ─────────────────────────────────────────────────────────────────────────────
// PMBoards — Role definitions (simplified)
// The fixed 4-role permission matrix has been replaced with per-member
// granular permissions. See lib/permissions.ts for the new model.
// Only the admin designation remains — admins bypass all permission checks.
// ─────────────────────────────────────────────────────────────────────────────

/** 'admin' = portfolio owner (email/password login, full access).
 *  'member' = any other team member (username login, permissions-controlled). */
export type Role = 'admin' | 'member'
