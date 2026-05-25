import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; recordId: string }> }

async function assertOwner(userId: string, projectId: string) {
  const doc = await adminDb.collection('projects').doc(projectId).get()
  if (!doc.exists) throw Object.assign(new Error('Project not found'), { status: 404 })
  if (doc.data()!.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, recordId } = await params
    await assertOwner(user.uid, projectId)

    const body  = await request.json()
    const ref   = adminDb.collection('projects').doc(projectId).collection('cashflow').doc(recordId)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'Record not found' }, { status: 404 })

    const year    = Number(body.year    ?? existing.data()!.year)
    const month   = Number(body.month   ?? existing.data()!.month)
    const monthKey = `${year}-${String(month).padStart(2, '0')}`

    await ref.update({
      year,
      month,
      monthKey,
      planned:   Number(body.planned ?? existing.data()!.planned) || 0,
      actual:    Number(body.actual  ?? existing.data()!.actual)  || 0,
      updatedAt: FieldValue.serverTimestamp(),
    })

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

    const { projectId, recordId } = await params
    await assertOwner(user.uid, projectId)

    const ref = adminDb.collection('projects').doc(projectId).collection('cashflow').doc(recordId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'Record not found' }, { status: 404 })

    await ref.delete()
    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
