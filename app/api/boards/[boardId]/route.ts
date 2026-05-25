import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

async function getBoard(boardId: string, userId: string) {
  const doc = await adminDb.collection('boards').doc(boardId).get()
  if (!doc.exists || doc.data()?.userId !== userId) return null
  return { id: doc.id, ...doc.data() }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId } = await params
  const board = await getBoard(boardId, user.uid)
  if (!board) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json(board)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId } = await params
  const board = await getBoard(boardId, user.uid)
  if (!board) return Response.json({ error: 'Not found' }, { status: 404 })

  const { title, description } = await request.json()
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (title !== undefined) updates.title = title.trim()
  if (description !== undefined) updates.description = description.trim()

  await adminDb.collection('boards').doc(boardId).update(updates)
  const updated = await adminDb.collection('boards').doc(boardId).get()
  return Response.json({ id: updated.id, ...updated.data() })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId } = await params
  const board = await getBoard(boardId, user.uid)
  if (!board) return Response.json({ error: 'Not found' }, { status: 404 })

  await adminDb.collection('boards').doc(boardId).delete()
  return new Response(null, { status: 204 })
}
