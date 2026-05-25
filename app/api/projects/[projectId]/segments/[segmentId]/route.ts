import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; segmentId: string }> }

async function assertOwner(userId: string, projectId: string) {
  const doc = await adminDb.collection('projects').doc(projectId).get()
  if (!doc.exists) throw Object.assign(new Error('Project not found'), { status: 404 })
  if (doc.data()!.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, segmentId } = await params
    await assertOwner(user.uid, projectId)

    const ref      = adminDb.collection('projects').doc(projectId).collection('segments').doc(segmentId)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'Segment not found' }, { status: 404 })

    const body    = await request.json()
    const oldData = existing.data()!
    const oldLen  = oldData.length as number

    const newLen = body.length !== undefined ? Number(body.length) || 0 : oldLen
    const delta  = newLen - oldLen

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }
    const allowed = ['zoneId','lineNumber','fromMH','toMH','diameter','length','material',
                     'startLat','startLng','endLat','endLng',
                     'excavation','piping','backfilling','basecourse','asphalt',
                     'overallPct','status']
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key]
    }
    if (body.length !== undefined) update.length = newLen

    await ref.update(update)

    // If length changed, update zone aggregate
    if (delta !== 0) {
      const zoneId = body.zoneId ?? oldData.zoneId
      await adminDb
        .collection('projects').doc(projectId)
        .collection('zones').doc(zoneId)
        .update({
          totalLength: FieldValue.increment(delta),
          updatedAt:   FieldValue.serverTimestamp(),
        }).catch(() => {})
    }

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

    const { projectId, segmentId } = await params
    await assertOwner(user.uid, projectId)

    const ref = adminDb.collection('projects').doc(projectId).collection('segments').doc(segmentId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'Segment not found' }, { status: 404 })

    const { zoneId, length } = doc.data()!

    await ref.delete()

    // Decrement project + zone aggregates
    await Promise.all([
      adminDb.collection('projects').doc(projectId).update({
        totalSegments: FieldValue.increment(-1),
        updatedAt:     FieldValue.serverTimestamp(),
      }),
      adminDb.collection('projects').doc(projectId).collection('zones').doc(zoneId).update({
        segmentCount: FieldValue.increment(-1),
        totalLength:  FieldValue.increment(-(length || 0)),
        updatedAt:    FieldValue.serverTimestamp(),
      }).catch(() => {}),
    ])

    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
