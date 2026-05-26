import { NextRequest } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40)
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body        = await request.json()
    const displayName = body.displayName?.trim()
    const slug        = (body.slug ? body.slug.trim() : toSlug(displayName)) as string

    if (!displayName) return Response.json({ error: 'Portfolio name is required' }, { status: 400 })
    if (!slug)        return Response.json({ error: 'Portfolio slug is required' },  { status: 400 })
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return Response.json({ error: 'Slug may only contain lowercase letters, numbers and hyphens' }, { status: 400 })
    }

    // Enforce slug uniqueness
    const slugDoc = await adminDb.collection('portfolioSlugs').doc(slug).get()
    if (slugDoc.exists) {
      return Response.json({ error: 'That portfolio name is already taken. Try a different one.' }, { status: 409 })
    }

    // Check this admin doesn't already own a portfolio
    const existing = await adminDb.collection('portfolios')
      .where('adminUserId', '==', user.uid).limit(1).get()
    if (!existing.empty) {
      return Response.json({ error: 'You already have a portfolio' }, { status: 409 })
    }

    // Create the portfolio document
    const portfolioRef = await adminDb.collection('portfolios').add({
      displayName,
      slug,
      adminUserId: user.uid,
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
    })
    const portfolioId = portfolioRef.id

    // Reserve slug
    await adminDb.collection('portfolioSlugs').doc(slug).set({ portfolioId })

    // Add admin as the first member (username = 'admin')
    await portfolioRef.collection('members').doc('admin').set({
      username:    'admin',
      displayName: user.email ?? 'Admin',
      role:        'admin',
      portfolioId,
      createdAt:   FieldValue.serverTimestamp(),
    })

    // Permanently set custom claims on the admin's Firebase Auth account
    await adminAuth.setCustomUserClaims(user.uid, {
      portfolioId,
      portfolioSlug: slug,
      role:          'admin',
      username:      'admin',
    })

    const doc = await portfolioRef.get()
    return Response.json({ id: portfolioId, ...doc.data() }, { status: 201 })
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const snap = await adminDb.collection('portfolios')
      .where('adminUserId', '==', user.uid).limit(1).get()

    if (snap.empty) return Response.json(null)
    return Response.json({ id: snap.docs[0].id, ...snap.docs[0].data() })
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
