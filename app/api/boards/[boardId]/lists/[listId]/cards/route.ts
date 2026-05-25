import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string; listId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId, listId } = await params
  const board = await adminDb.collection('boards').doc(boardId).get()
  if (!board.exists || board.data()?.userId !== user.uid) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const snapshot = await adminDb
    .collection('boards')
    .doc(boardId)
    .collection('lists')
    .doc(listId)
    .collection('cards')
    .orderBy('position', 'asc')
    .get()

  const cards = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  return Response.json(cards)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string; listId: string }> }
) {
  const user = await verifyAuth(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { boardId, listId } = await params
  const board = await adminDb.collection('boards').doc(boardId).get()
  if (!board.exists || board.data()?.userId !== user.uid) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { title, description } = await request.json()
  if (!title?.trim()) {
    return Response.json({ error: 'Title is required' }, { status: 400 })
  }

  const existing = await adminDb
    .collection('boards')
    .doc(boardId)
    .collection('lists')
    .doc(listId)
    .collection('cards')
    .orderBy('position', 'desc')
    .limit(1)
    .get()

  const position = existing.empty ? 0 : (existing.docs[0].data().position ?? 0) + 1

  const ref = await adminDb
    .collection('boards')
    .doc(boardId)
    .collection('lists')
    .doc(listId)
    .collection('cards')
    .add({
      title: title.trim(),
      description: description?.trim() ?? '',
      position,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

  const doc = await ref.get()
  return Response.json({ id: ref.id, ...doc.data() }, { status: 201 })
}
