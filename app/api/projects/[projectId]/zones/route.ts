import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.zones === 'none') {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const snap = await adminDb
      .collection('projects').doc(projectId)
      .collection('zones').get()

    const zones = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))

    return Response.json(zones)
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
      if (pagePerm.zones !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot create zones' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { name, description, totalLength, executedLength, status } = body

    if (!name?.trim()) return Response.json({ error: 'Zone name is required' }, { status: 400 })

    const total     = Number(totalLength)    || 0
    const executed  = Number(executedLength) || 0
    const remaining = Math.max(total - executed, 0)
    const pct       = total > 0 ? Math.min(Math.round((executed / total) * 100), 100) : 0

    const data = {
      projectId,
      name:            name.trim(),
      description:     description?.trim() ?? '',
      totalLength:     total,
      executedLength:  executed,
      remainingLength: remaining,
      completionPct:   pct,
      status:          status ?? 'not_started',
      segmentCount:    0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    const ref = await adminDb
      .collection('projects').doc(projectId)
      .collection('zones').add(data)

    await adminDb.collection('projects').doc(projectId).update({
      totalZones: FieldValue.increment(1),
      updatedAt:  FieldValue.serverTimestamp(),
    })

    const doc = await ref.get()
    return Response.json({ id: ref.id, ...doc.data() }, { status: 201 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
