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
      if (pagePerm.cash_flow === 'none') {
        // Return empty array rather than 403 so the overview page renders cleanly
        return Response.json([])
      }
    }

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
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.cash_flow !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot edit cash flow' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { year, month, planned, actual } = body

    if (!year || !month) return Response.json({ error: 'Year and month are required' }, { status: 400 })

    const monthKey = `${year}-${String(month).padStart(2, '0')}`

    const data = {
      projectId,
      year:    Number(year),
      month:   Number(month),
      monthKey,
      planned: Number(planned) || 0,
      actual:  Number(actual)  || 0,
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
