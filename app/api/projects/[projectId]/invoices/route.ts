import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string }> }

// Normalise an incoming lines array into stored InvoiceLine objects.
function sanitizeLines(raw: any): { lines: any[]; total: number } {
  const lines = Array.isArray(raw) ? raw : []
  const out = lines
    .map((l: any) => {
      const rate = Number(l.rate) || 0
      const qty  = Number(l.qty)  || 0
      return {
        boqId:       String(l.boqId ?? ''),
        code:        String(l.code ?? ''),
        description: String(l.description ?? ''),
        scope:       String(l.scope ?? ''),
        area:        String(l.area ?? ''),
        building:    String(l.building ?? ''),
        rate, qty,
        amount:      rate * qty,
      }
    })
    .filter(l => l.qty !== 0)   // only bill items with a quantity
  const total = out.reduce((s, l) => s + l.amount, 0)
  return { lines: out, total }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if ((pagePerm.invoices ?? 'none') === 'none') {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const snap = await adminDb
      .collection('projects').doc(projectId)
      .collection('invoices').get()

    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => {
        // newest date first, then newest created
        const da = String(a.date ?? ''), db = String(b.date ?? '')
        if (da !== db) return db.localeCompare(da)
        return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      })

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
      if (pagePerm.invoices !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot create invoices' }, { status: 403 })
      }
    }

    const body   = await request.json()
    const number = String(body.number ?? '').trim()
    const date   = String(body.date ?? '').trim()

    if (!number) return Response.json({ error: 'Invoice No. is required' }, { status: 400 })
    if (!date)   return Response.json({ error: 'Date is required' }, { status: 400 })

    const { lines, total } = sanitizeLines(body.lines)

    const paid = !!body.paid
    const data = {
      projectId, number, date,
      notes: String(body.notes ?? '').trim(),
      lines, total,
      paid,
      paymentDate: paid ? String(body.paymentDate ?? '').trim() : '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    const ref = await adminDb
      .collection('projects').doc(projectId)
      .collection('invoices').add(data)

    const doc = await ref.get()
    return Response.json({ id: ref.id, ...doc.data() }, { status: 201 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
