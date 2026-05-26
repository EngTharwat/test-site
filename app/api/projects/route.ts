import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess } from '@/lib/access'
import { can } from '@/lib/roles'
import { FieldValue } from 'firebase-admin/firestore'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await resolveAccess(user)

    // Members without portfolio access to the dashboard still need the project list
    // (so they can navigate into a project). Only the dashboard UI hides it.
    const snap = await adminDb
      .collection('projects')
      .where('userId', '==', access.adminUserId)
      .get()

    const projects = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))

    return Response.json(projects)
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await resolveAccess(user)
    if (!can(access.role, 'canEditProject')) {
      return Response.json({ error: 'Forbidden — only admins can create projects' }, { status: 403 })
    }

    const body = await request.json()
    const {
      name, client, contractor, consultant, location, projectType,
      contractValue, currency, totalNetworkLength, contractStartDate,
      contractEndDate, status, description,
    } = body

    if (!name?.trim()) return Response.json({ error: 'Project name is required' }, { status: 400 })

    const data = {
      userId:              access.adminUserId,
      portfolioId:         access.portfolioId ?? null,
      name:                name.trim(),
      client:              client?.trim()              ?? '',
      contractor:          contractor?.trim()          ?? '',
      consultant:          consultant?.trim()          ?? '',
      location:            location?.trim()            ?? '',
      projectType:         projectType                 ?? 'sewer_network',
      contractValue:       Number(contractValue)       || 0,
      currency:            currency                    ?? 'SAR',
      totalNetworkLength:  Number(totalNetworkLength)  || 0,
      contractStartDate:   contractStartDate           ?? '',
      contractEndDate:     contractEndDate             ?? '',
      status:              status                      ?? 'planning',
      description:         description?.trim()         ?? '',
      totalZones:      0,
      totalSegments:   0,
      executedLength:  0,
      completionPct:   0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    const ref = await adminDb.collection('projects').add(data)
    const doc = await ref.get()
    return Response.json({ id: ref.id, ...doc.data() }, { status: 201 })
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
