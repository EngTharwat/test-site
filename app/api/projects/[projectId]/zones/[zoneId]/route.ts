import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; zoneId: string }> }

async function assertOwner(userId: string, projectId: string) {
  const doc = await adminDb.collection('projects').doc(projectId).get()
  if (!doc.exists) throw Object.assign(new Error('Project not found'), { status: 404 })
  if (doc.data()!.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 })
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, zoneId } = await params
    await assertOwner(user.uid, projectId)

    const doc = await adminDb.collection('projects').doc(projectId).collection('zones').doc(zoneId).get()
    if (!doc.exists) return Response.json({ error: 'Zone not found' }, { status: 404 })

    return Response.json({ id: doc.id, ...doc.data() })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, zoneId } = await params
    await assertOwner(user.uid, projectId)

    const body  = await request.json()
    const ref   = adminDb.collection('projects').doc(projectId).collection('zones').doc(zoneId)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'Zone not found' }, { status: 404 })

    const total    = Number(body.totalLength    ?? existing.data()!.totalLength)    || 0
    const executed = Number(body.executedLength ?? existing.data()!.executedLength) || 0
    const remaining= Math.max(total - executed, 0)
    const pct      = total > 0 ? Math.min(Math.round((executed / total) * 100), 100) : 0

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      remainingLength: remaining,
      completionPct:   pct,
    }
    const allowed = ['name','description','totalLength','executedLength','status']
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key]
    }
    // Override computed
    update.totalLength    = total
    update.executedLength = executed

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

    const { projectId, zoneId } = await params
    await assertOwner(user.uid, projectId)

    const ref = adminDb.collection('projects').doc(projectId).collection('zones').doc(zoneId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'Zone not found' }, { status: 404 })

    await ref.delete()

    // Decrement project aggregate
    await adminDb.collection('projects').doc(projectId).update({
      totalZones: FieldValue.increment(-1),
      updatedAt:  FieldValue.serverTimestamp(),
    })

    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
