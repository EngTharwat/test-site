import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { resolveAccess } from '@/lib/access'
import { FieldValue } from 'firebase-admin/firestore'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await resolveAccess(user)

    const snap = await adminDb
      .collection('projects')
      .where('userId', '==', access.adminUserId)
      .get()

    let projects = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))

    // For members with specific project scope, filter to allowed projects only
    if (!access.isAdmin && access.memberPermissions?.project_scope === 'specific') {
      const allowedIds = new Set(access.memberPermissions.project_ids ?? [])
      projects = projects.filter((p: any) => allowedIds.has(p.id))
    }

    // Members with no permissions configured see nothing
    if (!access.isAdmin && !access.memberPermissions) {
      return Response.json([])
    }

    return Response.json(projects)
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await resolveAccess(user)
    if (!access.isAdmin) {
      return Response.json(
        { error: 'Forbidden — only admins can create projects' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      name, client, contractor, consultant, location, projectType,
      contractValue, currency, totalNetworkLength, contractStartDate,
      contractEndDate, description,
      gravityLength, forcemainLength, houseConnectionsLength,
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
      status:              'planning',
      description:         description?.trim()         ?? '',
      gravityLength:          Number(gravityLength)          || 0,
      forcemainLength:        Number(forcemainLength)        || 0,
      houseConnectionsLength: Number(houseConnectionsLength) || 0,
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
    return Response.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    )
  }
}
