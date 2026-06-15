import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions } from '@/lib/permissions'
import { FieldValue } from 'firebase-admin/firestore'

type Params = { params: Promise<{ projectId: string; invoiceId: string }> }

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
    .filter(l => l.qty !== 0)
  const total = out.reduce((s, l) => s + l.amount, 0)
  return { lines: out, total }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, invoiceId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.invoices !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot edit invoices' }, { status: 403 })
      }
    }

    const body = await request.json()
    const ref  = adminDb.collection('projects').doc(projectId).collection('invoices').doc(invoiceId)
    const existing = await ref.get()
    if (!existing.exists) return Response.json({ error: 'Invoice not found' }, { status: 404 })

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    if (body.number !== undefined) update.number = String(body.number ?? '').trim()
    if (body.date   !== undefined) update.date   = String(body.date ?? '').trim()
    if (body.notes  !== undefined) update.notes  = String(body.notes ?? '').trim()
    if (body.paid   !== undefined) {
      const paid = !!body.paid
      update.paid = paid
      // Clear the payment date when an invoice is marked unpaid.
      update.paymentDate = paid ? String(body.paymentDate ?? existing.data()!.paymentDate ?? '').trim() : ''
    } else if (body.paymentDate !== undefined) {
      update.paymentDate = String(body.paymentDate ?? '').trim()
    }
    if (body.lines  !== undefined) {
      const { lines, total } = sanitizeLines(body.lines)
      update.lines = lines
      update.total = total
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

    const { projectId, invoiceId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      const pagePerm = getProjectPagePermissions(access.memberPermissions!, projectId)
      if (pagePerm.invoices !== 'edit') {
        return Response.json({ error: 'Forbidden — cannot delete invoices' }, { status: 403 })
      }
    }

    const ref = adminDb.collection('projects').doc(projectId).collection('invoices').doc(invoiceId)
    const doc = await ref.get()
    if (!doc.exists) return Response.json({ error: 'Invoice not found' }, { status: 404 })

    await ref.delete()
    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
