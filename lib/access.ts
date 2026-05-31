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
 * Detection order — Firestore is the source of truth:
 *
 *  1. Query portfolios for adminUserId === token.uid.
 *     If found → confirmed admin (no UID format or claim assumptions needed).
 *
 *  2. Fall through to member path using portfolioId + username claims.
 *     Member UIDs are always "m_{portfolioId}_{username}" so they will
 *     never match step 1, but we don't rely on that format for correctness.
 *
 *  3. No portfolio found and no member claims → new admin who hasn't
 *     created a portfolio yet.
 */
export async function resolveAccess(token: DecodedIdToken): Promise<Access> {

  // ── 1. Admin check: does any portfolio list this UID as its owner? ──────────
  const adminSnap = await adminDb
    .collection('portfolios')
    .where('adminUserId', '==', token.uid)
    .limit(1)
    .get()

  if (!adminSnap.empty) {
    return {
      userId:            token.uid,
      adminUserId:       token.uid,
      isAdmin:           true,
      portfolioId:       adminSnap.docs[0].id,
      memberPermissions: null,
      username:          null,
    }
  }

  // ── 2. Member check: token carries portfolioId + username claims ────────────
  const portfolioId = token.portfolioId as string | undefined
  const username    = token.username    as string | undefined

  if (portfolioId && username) {
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

  // ── 3. New admin who hasn't created a portfolio yet ─────────────────────────
  return {
    userId:            token.uid,
    adminUserId:       token.uid,
    isAdmin:           true,
    portfolioId:       null,
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
