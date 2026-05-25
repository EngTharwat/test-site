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

const defaultActivity = (qty: number) => ({
  plannedQty: qty, actualQty: 0, pct: 0,
  status: 'not_started', startDate: '', finishDate: '',
})

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    await assertOwner(user.uid, projectId)

    const { searchParams } = new URL(request.url)
    const zoneId = searchParams.get('zoneId')

    let query = adminDb.collection('projects').doc(projectId).collection('segments') as any
    if (zoneId) query = query.where('zoneId', '==', zoneId)

    const snap = await query.get()
    const segments = snap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))

    return Response.json(segments)
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
    const {
      zoneId, lineNumber, fromMH, toMH, diameter, length, material,
      startLat, startLng, endLat, endLng,
      excavation, piping, backfilling, basecourse, asphalt,
    } = body

    if (!zoneId)   return Response.json({ error: 'zoneId is required' },  { status: 400 })
    if (!length)   return Response.json({ error: 'length is required' },   { status: 400 })

    const len = Number(length) || 0

    const data = {
      projectId,
      zoneId,
      lineNumber: lineNumber?.trim() ?? '',
      fromMH:     fromMH?.trim()     ?? '',
      toMH:       toMH?.trim()       ?? '',
      diameter:   Number(diameter)   || 0,
      length:     len,
      material:   material           ?? 'uPVC',
      startLat:   startLat != null   ? Number(startLat) : null,
      startLng:   startLng != null   ? Number(startLng) : null,
      endLat:     endLat   != null   ? Number(endLat)   : null,
      endLng:     endLng   != null   ? Number(endLng)   : null,
      // Activities — use supplied or default
      excavation:   excavation  ?? defaultActivity(len),
      piping:       piping      ?? defaultActivity(len),
      backfilling:  backfilling ?? defaultActivity(len),
      basecourse:   basecourse  ?? defaultActivity(len),
      asphalt:      asphalt     ?? defaultActivity(len),
      overallPct: 0,
      status:     'not_started',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    const ref = await adminDb.collection('projects').doc(projectId).collection('segments').add(data)

    // Update project + zone aggregates
    await Promise.all([
      adminDb.collection('projects').doc(projectId).update({
        totalSegments: FieldValue.increment(1),
        updatedAt:     FieldValue.serverTimestamp(),
      }),
      adminDb.collection('projects').doc(projectId).collection('zones').doc(zoneId).update({
        segmentCount: FieldValue.increment(1),
        totalLength:  FieldValue.increment(len),
        updatedAt:    FieldValue.serverTimestamp(),
      }).catch(() => {}), // zone may not exist in some edge cases
    ])

    const doc = await ref.get()
    return Response.json({ id: ref.id, ...doc.data() }, { status: 201 })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
