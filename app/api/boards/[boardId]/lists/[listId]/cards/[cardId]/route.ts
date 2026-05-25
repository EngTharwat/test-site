import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

async function getCardRef(boardId: string, listId: string, cardId: string, userId: string) {
  const board = await adminDb.collection('boards').doc(boardId).get()
  if (!board.exists || board.data()?.userId !== userId) return null
  const card = await adminDb
    .collection('boards')
    .doc(boardId)
    .collection('lists')
    .doc(listId)
    .collection('cards')
    .doc(cardId)
    .get()
  if (!card.exists) return null
  return card
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string; listId: string; cardId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId, listId, cardId } = await params
  const card = await getCardRef(boardId, listId, cardId, user.uid)
  if (!card) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ id: card.id, ...card.data() })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string; listId: string; cardId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId, listId, cardId } = await params
  const card = await getCardRef(boardId, listId, cardId, user.uid)
  if (!card) return Response.json({ error: 'Not found' }, { status: 404 })

  const { title, description, position } = await request.json()
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (title !== undefined) updates.title = title.trim()
  if (description !== undefined) updates.description = description.trim()
  if (position !== undefined) updates.position = position

  const ref = adminDb
    .collection('boards')
    .doc(boardId)
    .collection('lists')
    .doc(listId)
    .collection('cards')
    .doc(cardId)

  await ref.update(updates)
  const updated = await ref.get()
  return Response.json({ id: updated.id, ...updated.data() })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string; listId: string; cardId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId, listId, cardId } = await params
  const card = await getCardRef(boardId, listId, cardId, user.uid)
  if (!card) return Response.json({ error: 'Not found' }, { status: 404 })

  await adminDb
    .collection('boards')
    .doc(boardId)
    .collection('lists')
    .doc(listId)
    .collection('cards')
    .doc(cardId)
    .delete()

  return new Response(null, { status: 204 })
}
