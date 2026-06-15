import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess, assertProjectAccess } from '@/lib/access'
import { getProjectPagePermissions, EDITABLE_PAGES } from '@/lib/permissions'
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
      // The project doc (currency, type, map style…) is needed by several views.
      if (pagePerm.overview === 'none' && (pagePerm.boq ?? 'none') === 'none'
          && (pagePerm.invoices ?? 'none') === 'none') {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const doc = await adminDb.collection('projects').doc(projectId).get()
    return Response.json({ id: doc.id, ...doc.data() })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    const ref  = adminDb.collection('projects').doc(projectId)
    const body = await request.json()

    // Non-admins with edit access to any page may update ONLY the shared map
    // display style — nothing else about the project.
    if (!access.isAdmin) {
      const perm     = getProjectPagePermissions(access.memberPermissions!, projectId)
      const isEditor = EDITABLE_PAGES.some(p => perm[p] === 'edit')
      const keys     = Object.keys(body)
      if (!isEditor || keys.some(k => k !== 'mapStyle')) {
        return Response.json({ error: 'Forbidden — only admins can edit projects' }, { status: 403 })
      }
    }

    const allowed = [
      'name','client','contractor','consultant','location','projectType',
      'contractValue','currency','totalNetworkLength','contractStartDate',
      'contractEndDate','status','description',
      'breakdownEntries',
      'totalZones','totalSegments','executedLength','completionPct',
      'mapStyle',
    ]
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    for (const key of allowed) {
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

    const { projectId } = await params
    const access = await resolveAccess(user)
    await assertProjectAccess(access, projectId)

    if (!access.isAdmin) {
      return Response.json({ error: 'Forbidden — only admins can delete projects' }, { status: 403 })
    }

    await adminDb.collection('projects').doc(projectId).delete()
    return new Response(null, { status: 204 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
