import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; itemId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, itemId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.boq !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot edit BOQ items' }, { status: 403 })
      }
    }

    const body = await request.json()
    const ref  = adminDb.collection('projects').doc(projectId).collection('boq').doc(itemId)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'BOQ item not found' }, { status: 404 })

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    for (const key of ['scope', 'area', 'building', 'trade', 'activity', 'code', 'description']) {
      if (body[key] !== undefined) update[key] = String(body[key] ?? '').trim()
    }
    if (body.rate !== undefined) update.rate = Number(body.rate) || 0
    if (body.qty  !== undefined) update.qty  = Number(body.qty)  || 0

    // Keep derived total in sync
    const rate = update.rate !== undefined ? (update.rate as number) : (existing.data()!.rate ?? 0)
    const qty  = update.qty  !== undefined ? (update.qty  as number) : (existing.data()!.qty  ?? 0)
    update.totalPrice = (rate as number) * (qty as number)

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

    const { projectId, itemId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.boq !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot delete BOQ items' }, { status: 403 })
      }
    }

    const ref = adminDb.collection('projects').doc(projectId).collection('boq').doc(itemId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'BOQ item not found' }, { status: 404 })

    await ref.delete()
    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
