import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; segmentId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, segmentId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    // Determine what this user can edit:
    // - canProgress:   editing activity fields (excavation %, piping %, etc.)  → progress page permission
    // - canStructural: editing physical segment fields (dimensions, location)    → segments page permission
    let canProgress   = access.isAdmin
    let canStructural = access.isAdmin
    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      canProgress   = pagePerm.progress  === 'edit'
      canStructural = pagePerm.segments  === 'edit'
    }

    if (!canProgress && !canStructural) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ref      = adminDb.collection('projects').doc(projectId).collection('segments').doc(segmentId)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'Segment not found' }, { status: 404 })

    const body    = await request.json()
    const oldData = existing.data()!
    const oldLen  = oldData.length as number
    const newLen  = body.length !== undefined ? Number(body.length) || 0 : oldLen
    const delta   = newLen - oldLen

    const progressFields   = ['excavation','piping','backfilling','basecourse','asphalt','overallPct','status']
    const structuralFields = ['zoneId','lineNumber','fromMH','toMH','diameter','length','material',
                              'basecourseThickness','asphaltThickness','surfaceType','permitId',
                              'startLat','startLng','endLat','endLng']

    const allowed = [
      ...(canProgress   ? progressFields   : []),
      ...(canStructural ? structuralFields : []),
    ]

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key]
    }
    if (canStructural && body.length !== undefined) update.length = newLen

    await ref.update(update)

    if (canStructural && delta !== 0) {
      const zoneId = body.zoneId ?? oldData.zoneId
      await adminDb
        .collection('projects').doc(projectId)
        .collection('zones').doc(zoneId)
        .update({ totalLength: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() })
        .catch(() => {})
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
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.segments !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot delete segments' }, { status: 403 })
      }
    }

    const ref = adminDb.collection('projects').doc(projectId).collection('segments').doc(segmentId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'Segment not found' }, { status: 404 })

    const { zoneId, length } = doc.data()!
    await ref.delete()

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
