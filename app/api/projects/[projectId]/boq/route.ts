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
      if ((pagePerm.boq ?? 'none') === 'none') {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const snap = await adminDb
      .collection('projects').doc(projectId)
      .collection('boq').get()

    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))

    return Response.json(items)
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
      if (pagePerm.boq !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot create BOQ items' }, { status: 403 })
      }
    }

    const body = await request.json()
    const scope       = String(body.scope ?? '').trim()
    const code        = String(body.code ?? '').trim()
    const description = String(body.description ?? '').trim()
    const rate        = Number(body.rate)
    const qty         = Number(body.qty)

    // Mandatory: scope, ID (code), description, rate, qty
    if (!scope)       return Response.json({ error: 'Scope is required' }, { status: 400 })
    if (!code)        return Response.json({ error: 'ID is required' }, { status: 400 })
    if (!description) return Response.json({ error: 'Description is required' }, { status: 400 })
    if (!Number.isFinite(rate)) return Response.json({ error: 'Rate is required' }, { status: 400 })
    if (!Number.isFinite(qty))  return Response.json({ error: 'Qty is required' }, { status: 400 })

    const data = {
      projectId,
      scope,
      area:        String(body.area ?? '').trim(),
      building:    String(body.building ?? '').trim(),
      trade:       String(body.trade ?? '').trim(),
      activity:    String(body.activity ?? '').trim(),
      code,
      description,
      rate,
      qty,
      totalPrice:  rate * qty,
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
    }

    const ref = await adminDb
      .collection('projects').doc(projectId)
      .collection('boq').add(data)

    const doc = await ref.get()
    return Response.json({ id: ref.id, ...doc.data() }, { status: 201 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
