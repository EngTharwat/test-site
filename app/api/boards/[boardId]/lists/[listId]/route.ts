import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

async function getListRef(boardId: string, listId: string, userId: string) {
  const board = await adminDb.collection('boards').doc(boardId).get()
  if (!board.exists || board.data()?.userId !== userId) return null
  const list = await adminDb
    .collection('boards')
    .doc(boardId)
    .collection('lists')
    .doc(listId)
    .get()
  if (!list.exists) return null
  return list
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string; listId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId, listId } = await params
  const list = await getListRef(boardId, listId, user.uid)
  if (!list) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ id: list.id, ...list.data() })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string; listId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId, listId } = await params
  const list = await getListRef(boardId, listId, user.uid)
  if (!list) return Response.json({ error: 'Not found' }, { status: 404 })

  const { title, position } = await request.json()
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (title !== undefined) updates.title = title.trim()
  if (position !== undefined) updates.position = position

  const ref = adminDb.collection('boards').doc(boardId).collection('lists').doc(listId)
  await ref.update(updates)
  const updated = await ref.get()
  return Response.json({ id: updated.id, ...updated.data() })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string; listId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId, listId } = await params
  const list = await getListRef(boardId, listId, user.uid)
  if (!list) return Response.json({ error: 'Not found' }, { status: 404 })

  await adminDb
    .collection('boards')
    .doc(boardId)
    .collection('lists')
    .doc(listId)
    .delete()

  return new Response(null, { status: 204 })
}
