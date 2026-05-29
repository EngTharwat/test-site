import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess } from '@/lib/access'
import { FieldValue } from 'firebase-admin/firestore'
import type { MemberPermissions } from '@/lib/permissions'
import { DEFAULT_PAGE_PERMISSIONS } from '@/lib/permissions'

type Params = { params: Promise<{ portfolioId: string }> }

async function assertAdmin(request: NextRequest, portfolioId: string) {
  const user = await verifyAuth(request)
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  const access = await resolveAccess(user)
  if (!access.isAdmin || access.portfolioId !== portfolioId) {
    // Also allow legacy admin by checking portfolio ownership
    const doc = await adminDb.collection('portfolios').doc(portfolioId).get()
    if (!doc.exists || doc.data()!.adminUserId !== user.uid) {
      throw Object.assign(new Error('Forbidden'), { status: 403 })
    }
  }
  return user
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { portfolioId } = await params
    await assertAdmin(request, portfolioId)

    const snap = await adminDb
      .collection('portfolios').doc(portfolioId)
      .collection('members').get()

    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    return Response.json(members)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { portfolioId } = await params
    await assertAdmin(request, portfolioId)

    const body        = await request.json()
    const username    = (body.username    as string | undefined)?.toLowerCase().trim()
    const displayName = (body.displayName as string | undefined)?.trim()
    const permissions = body.permissions as MemberPermissions | undefined

    if (!username)    return Response.json({ error: 'Username is required' },    { status: 400 })
    if (!displayName) return Response.json({ error: 'Display name is required' }, { status: 400 })
    if (!/^[a-z0-9_-]+$/.test(username)) {
      return Response.json(
        { error: 'Username may only contain lowercase letters, numbers, hyphens and underscores' },
        { status: 400 },
      )
    }

    const memberRef = adminDb
      .collection('portfolios').doc(portfolioId)
      .collection('members').doc(username)

    const existing = await memberRef.get()
    if (existing.exists) {
      return Response.json(
        { error: 'A member with that username already exists' },
        { status: 409 },
      )
    }

    // Default permissions: all-none on all projects if not provided
    const memberPermissions: MemberPermissions = permissions ?? {
      project_scope:    'all',
      project_ids:      null,
      page_permissions: { ...DEFAULT_PAGE_PERMISSIONS },
    }

    const data = {
      username,
      displayName,
      permissions:  memberPermissions,
      portfolioId,
      createdAt:    FieldValue.serverTimestamp(),
    }
    await memberRef.set(data)

    return Response.json({ id: username, ...data }, { status: 201 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
