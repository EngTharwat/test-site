import { NextRequest } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess } from '@/lib/access'
import { ROLES } from '@/lib/roles'

type Params = { params: Promise<{ portfolioId: string; username: string }> }

async function assertAdmin(request: NextRequest, portfolioId: string) {
  const user   = await verifyAuth(request)
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  const access = await resolveAccess(user)
  if (access.role !== 'admin') {
    const doc = await adminDb.collection('portfolios').doc(portfolioId).get()
    if (!doc.exists || doc.data()!.adminUserId !== user.uid) {
      throw Object.assign(new Error('Forbidden'), { status: 403 })
    }
  }
  return user
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { portfolioId, username } = await params
    await assertAdmin(request, portfolioId)

    const body = await request.json()
    const role = body.role as string | undefined
    const displayName = body.displayName as string | undefined

    if (role && !ROLES.includes(role as any)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (username === 'admin' && role && role !== 'admin') {
      return Response.json({ error: 'Cannot change the admin member role' }, { status: 400 })
    }

    const memberRef = adminDb
      .collection('portfolios').doc(portfolioId)
      .collection('members').doc(username)

    const existing = await memberRef.get()
    if (!existing.exists) return Response.json({ error: 'Member not found' }, { status: 404 })

    const update: Record<string, unknown> = {}
    if (role)        update.role        = role
    if (displayName) update.displayName = displayName.trim()

    await memberRef.update(update)

    // If role changed, update the Firebase Auth claims for this member (if they've logged in)
    if (role) {
      const uid = `m_${portfolioId}_${username}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 128)
      try {
        const fbUser = await adminAuth.getUser(uid)
        const currentClaims = fbUser.customClaims ?? {}
        await adminAuth.setCustomUserClaims(uid, { ...currentClaims, role })
      } catch {
        // Member hasn't logged in yet — claims will be set on first login
      }
    }

    const updated = await memberRef.get()
    return Response.json({ id: username, ...updated.data() })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { portfolioId, username } = await params
    await assertAdmin(request, portfolioId)

    if (username === 'admin') {
      return Response.json({ error: 'Cannot remove the admin account' }, { status: 400 })
    }

    const memberRef = adminDb
      .collection('portfolios').doc(portfolioId)
      .collection('members').doc(username)

    const existing = await memberRef.get()
    if (!existing.exists) return Response.json({ error: 'Member not found' }, { status: 404 })

    await memberRef.delete()

    // Revoke Firebase Auth session if the member had logged in
    const uid = `m_${portfolioId}_${username}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 128)
    try {
      await adminAuth.revokeRefreshTokens(uid)
      await adminAuth.deleteUser(uid)
    } catch {
      // Member may not have a Firebase Auth account yet
    }

    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
