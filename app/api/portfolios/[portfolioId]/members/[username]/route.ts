import { NextRequest } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess } from '@/lib/access'
import type { MemberPermissions } from '@/lib/permissions'

type Params = { params: Promise<{ portfolioId: string; username: string }> }

async function assertAdmin(request: NextRequest, portfolioId: string) {
  const user   = await verifyAuth(request)
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  const access = await resolveAccess(user)
  if (!access.isAdmin) {
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

    if (username === 'admin') {
      return Response.json(
        { error: 'Cannot modify the admin account permissions' },
        { status: 400 },
      )
    }

    const body        = await request.json()
    const permissions = body.permissions as MemberPermissions | undefined
    const displayName = body.displayName as string | undefined

    const memberRef = adminDb
      .collection('portfolios').doc(portfolioId)
      .collection('members').doc(username)

    const existing = await memberRef.get()
    if (!existing.exists) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const update: Record<string, unknown> = {}
    if (permissions)  update.permissions  = permissions
    if (displayName)  update.displayName  = displayName.trim()

    await memberRef.update(update)

    // If this member has an active Firebase Auth session, revoke it so their
    // token is refreshed and the new permissions are picked up on next sign-in.
    if (permissions) {
      const uid = `m_${portfolioId}_${username}`
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .slice(0, 128)
      try {
        await adminAuth.revokeRefreshTokens(uid)
      } catch {
        // Member hasn't logged in yet — nothing to revoke
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
    if (!existing.exists) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    await memberRef.delete()

    // Revoke Firebase Auth session if the member had logged in
    const uid = `m_${portfolioId}_${username}`
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .slice(0, 128)
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
