import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string }> }

const FIELDS = [
  'permitNo','projectName','workOrderNo','serviceAuthority','amanah','municipality',
  'district','contractor','consultant','startDate','permitType','status','excavation','expiryDate',
] as const

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.permits === 'none') {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const snap = await adminDb
      .collection('projects').doc(projectId)
      .collection('permits').get()

    const permits = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))

    return Response.json(permits)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.permits !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot create permits' }, { status: 403 })
      }
    }

    const body = await request.json()
    if (!body.permitNo?.trim()) {
      return Response.json({ error: 'Permit number is required' }, { status: 400 })
    }

    const data: Record<string, unknown> = {
      projectId,
      createdAt:  FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    }
    for (const f of FIELDS) {
      data[f] = typeof body[f] === 'string' ? body[f].trim() : (body[f] ?? '')
    }

    const ref = await adminDb
      .collection('projects').doc(projectId)
      .collection('permits').add(data)

    const doc = await ref.get()
    return Response.json({ id: ref.id, ...doc.data() }, { status: 201 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
