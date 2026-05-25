import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const doc = await adminDb.collection('projects').doc(projectId).get()

    if (!doc.exists) return Response.json({ error: 'Not found' }, { status: 404 })
    const data = doc.data()!
    if (data.userId !== user.uid) return Response.json({ error: 'Forbidden' }, { status: 403 })

    return Response.json({ id: doc.id, ...data })
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ref  = adminDb.collection('projects').doc(projectId)
    const doc  = await ref.get()

    if (!doc.exists) return Response.json({ error: 'Not found' }, { status: 404 })
    if (doc.data()!.userId !== user.uid) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const allowed = [
      'name','client','contractor','consultant','location','projectType',
      'contractValue','currency','totalNetworkLength','contractStartDate',
      'contractEndDate','status','description',
      // Aggregate fields (updated by system)
      'totalZones','totalSegments','executedLength','completionPct',
    ]
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key]
    }

    await ref.update(update)
    const updated = await ref.get()
    return Response.json({ id: updated.id, ...updated.data() })
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ref = adminDb.collection('projects').doc(projectId)
    const doc = await ref.get()

    if (!doc.exists) return Response.json({ error: 'Not found' }, { status: 404 })
    if (doc.data()!.userId !== user.uid) return Response.json({ error: 'Forbidden' }, { status: 403 })

    await ref.delete()
    return new Response(null, { status: 204 })
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
