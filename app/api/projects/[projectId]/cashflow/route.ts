import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string }> }

async function assertOwner(userId: string, projectId: string) {
  const doc = await adminDb.collection('projects').doc(projectId).get()
  if (!doc.exists) throw Object.assign(new Error('Project not found'), { status: 404 })
  if (doc.data()!.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 })
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    await assertOwner(user.uid, projectId)

    const snap = await adminDb
      .collection('projects').doc(projectId)
      .collection('cashflow').get()

    const records = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => a.monthKey?.localeCompare(b.monthKey ?? ''))

    return Response.json(records)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    await assertOwner(user.uid, projectId)

    const body = await request.json()
    const { year, month, planned, actual } = body

    if (!year || !month) return Response.json({ error: 'Year and month are required' }, { status: 400 })

    const monthKey = `${year}-${String(month).padStart(2, '0')}`

    const data = {
      projectId,
      year:     Number(year),
      month:    Number(month),
      monthKey,
      planned:  Number(planned) || 0,
      actual:   Number(actual)  || 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    const ref = await adminDb
      .collection('projects').doc(projectId)
      .collection('cashflow').add(data)

    const doc = await ref.get()
    return Response.json({ id: ref.id, ...doc.data() }, { status: 201 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
