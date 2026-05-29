import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; zoneId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, zoneId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.zones === 'none') {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

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
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.zones !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot edit zones' }, { status: 403 })
      }
    }

    const body     = await request.json()
    const ref      = adminDb.collection('projects').doc(projectId).collection('zones').doc(zoneId)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'Zone not found' }, { status: 404 })

    const total     = Number(body.totalLength    ?? existing.data()!.totalLength)    || 0
    const executed  = Number(body.executedLength ?? existing.data()!.executedLength) || 0
    const remaining = Math.max(total - executed, 0)
    const pct       = total > 0 ? Math.min(Math.round((executed / total) * 100), 100) : 0

    const update: Record<string, unknown> = {
      updatedAt:       FieldValue.serverTimestamp(),
      remainingLength: remaining,
      completionPct:   pct,
      totalLength:     total,
      executedLength:  executed,
    }
    for (const key of ['name','description','status']) {
      if (body[key] !== undefined) update[key] = body[key]
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

    const { projectId, zoneId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.zones !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot delete zones' }, { status: 403 })
      }
    }

    const ref = adminDb.collection('projects').doc(projectId).collection('zones').doc(zoneId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'Zone not found' }, { status: 404 })

    await ref.delete()
    await adminDb.collection('projects').doc(projectId).update({
      totalZones: FieldValue.increment(-1),
      updatedAt:  FieldValue.serverTimestamp(),
    })

    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
