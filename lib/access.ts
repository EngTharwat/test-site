// ─────────────────────────────────────────────────────────────────────────────
// PMBoards — Server-side access resolution helper
// Used by all API routes to enforce portfolio membership + role checks
// ─────────────────────────────────────────────────────────────────────────────

import { adminDb } from './firebase-admin'
import type { DecodedIdToken } from 'firebase-admin/auth'
import type { Role } from './roles'

export interface Access {
  userId:      string        // Firebase UID of the requesting user
  adminUserId: string        // Firebase UID of the portfolio owner (= admin)
  role:        Role
  portfolioId: string | null
}

/**
 * Resolve access context from a verified Firebase ID token.
 * - Members:       token has portfolioId + role claims  → look up admin via portfolio doc
 * - Legacy admins: token has no claims                  → treat uid as adminUserId
 */
export async function resolveAccess(token: DecodedIdToken): Promise<Access> {
  const portfolioId = token.portfolioId as string | undefined
  const role        = token.role        as Role   | undefined

  if (portfolioId && role) {
    const doc = await adminDb.collection('portfolios').doc(portfolioId).get()
    if (!doc.exists) throw Object.assign(new Error('Portfolio not found'), { status: 403 })
    return {
      userId:      token.uid,
      adminUserId: doc.data()!.adminUserId as string,
      role,
      portfolioId,
    }
  }

  // Legacy admin — no portfolio claims yet
  return {
    userId:      token.uid,
    adminUserId: token.uid,
    role:        'admin',
    portfolioId: null,
  }
}

/**
 * Assert that the project belongs to the portfolio's admin user.
 * Throws a { message, status } error if not.
 */
export async function assertProjectAccess(access: Access, projectId: string) {
  const doc = await adminDb.collection('projects').doc(projectId).get()
  if (!doc.exists)
    throw Object.assign(new Error('Project not found'), { status: 404 })
  if (doc.data()!.userId !== access.adminUserId)
    throw Object.assign(new Error('Forbidden'), { status: 403 })
}
