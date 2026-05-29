import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; recordId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, recordId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.cash_flow !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot edit cash flow' }, { status: 403 })
      }
    }

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
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.cash_flow !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot delete cash flow records' }, { status: 403 })
      }
    }

    const ref = adminDb.collection('projects').doc(projectId).collection('cashflow').doc(recordId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'Record not found' }, { status: 404 })

    await ref.delete()
    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
