import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; permitId: string }> }

const FIELDS = [
  'permitNo','projectName','workOrderNo','serviceAuthority','amanah','municipality',
  'district','contractor','consultant','startDate','permitType','status','excavation','expiryDate',
]

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, permitId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.permits !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot edit permits' }, { status: 403 })
      }
    }

    const ref = adminDb.collection('projects').doc(projectId).collection('permits').doc(permitId)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'Permit not found' }, { status: 404 })

    const body = await request.json()
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    for (const f of FIELDS) {
      if (body[f] !== undefined) update[f] = typeof body[f] === 'string' ? body[f].trim() : body[f]
    }

    await ref.update(update)
    const updated = await ref.get()
    return Response.json({ id: updated.id, ...updated.data() })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, permitId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.permits !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot delete permits' }, { status: 403 })
      }
    }

    const ref = adminDb.collection('projects').doc(projectId).collection('permits').doc(permitId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'Permit not found' }, { status: 404 })

    await ref.delete()
    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
