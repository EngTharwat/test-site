// ─────────────────────────────────────────────────────────────────────────────
// PMBoards — Server-side access resolution helper
// Used by all API routes to enforce portfolio membership + permission checks
// ─────────────────────────────────────────────────────────────────────────────

import { adminDb } from './firebase-admin'
import type { DecodedIdToken } from 'firebase-admin/auth'
import {
  canAccessProject,
  type MemberPermissions,
} from './permissions'

export interface Access {
  /** Firebase UID of the requesting user. */
  userId:            string
  /** Firebase UID of the portfolio owner (admin). */
  adminUserId:       string
  /** True for email/password admin users. Members are always false. */
  isAdmin:           boolean
  /** The portfolio this user belongs to. Null for admins before portfolio setup. */
  portfolioId:       string | null
  /** Granular permissions for non-admin members. Null for admins. */
  memberPermissions: MemberPermissions | null
  /** Username in the portfolio members collection. Null for admins. */
  username:          string | null
}

/**
 * Resolve an access context from a verified Firebase ID token.
 *
 * Detection strategy — UID structure, NOT token claims:
 *   Member UIDs: always "m_{portfolioId}_{username}" (set in member-login route)
 *   Admin UIDs:  random Firebase Auth UIDs (never start with "m_")
 *
 * This is intentionally claim-independent so it works for any token age or
 * claim state (avoids the bug where admin tokens with username:'admin' claim
 * were misrouted into the member path).
 */
export async function resolveAccess(token: DecodedIdToken): Promise<Access> {
  const isMember = token.uid.startsWith('m_')

  if (isMember) {
    const portfolioId = token.portfolioId as string | undefined
    const username    = token.username    as string | undefined

    if (!portfolioId || !username) {
      throw Object.assign(new Error('Invalid member token — missing claims'), { status: 401 })
    }

    // Fetch portfolio (for adminUserId) and member doc (for permissions) in parallel
    const [portfolioDoc, memberDoc] = await Promise.all([
      adminDb.collection('portfolios').doc(portfolioId).get(),
      adminDb.collection('portfolios').doc(portfolioId)
        .collection('members').doc(username).get(),
    ])

    if (!portfolioDoc.exists) {
      throw Object.assign(new Error('Portfolio not found'), { status: 403 })
    }

    const memberPermissions =
      (memberDoc.data()?.permissions ?? null) as MemberPermissions | null

    return {
      userId:            token.uid,
      adminUserId:       portfolioDoc.data()!.adminUserId as string,
      isAdmin:           false,
      portfolioId,
      memberPermissions,
      username,
    }
  }

  // Admin (email/password user — UID is a standard Firebase Auth UID)
  return {
    userId:            token.uid,
    adminUserId:       token.uid,
    isAdmin:           true,
    portfolioId:       (token.portfolioId as string | undefined) ?? null,
    memberPermissions: null,
    username:          null,
  }
}

/**
 * Assert that:
 * 1. The project exists and belongs to the same portfolio admin as the requester.
 * 2. For members: their project_scope allows this project.
 *
 * Throws a { message, status } error if any check fails.
 */
export async function assertProjectAccess(access: Access, projectId: string) {
  const doc = await adminDb.collection('projects').doc(projectId).get()
  if (!doc.exists) {
    throw Object.assign(new Error('Project not found'), { status: 404 })
  }
  if (doc.data()!.userId !== access.adminUserId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  // Members must have permissions configured and the project must be in scope
  if (!access.isAdmin) {
    if (!access.memberPermissions) {
      throw Object.assign(
        new Error('Forbidden — permissions not configured for this account'),
        { status: 403 },
      )
    }
    if (!canAccessProject(access.memberPermissions, projectId)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 })
    }
  }
}
