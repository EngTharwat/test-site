import { NextRequest } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const portfolioSlug = (body.portfolioSlug as string | undefined)?.toLowerCase().trim()
    const username      = (body.username      as string | undefined)?.toLowerCase().trim()

    if (!portfolioSlug || !username) {
      return Response.json({ error: 'Portfolio name and username are required' }, { status: 400 })
    }

    // Look up portfolio by slug
    const slugDoc = await adminDb.collection('portfolioSlugs').doc(portfolioSlug).get()
    if (!slugDoc.exists) {
      return Response.json({ error: 'Portfolio not found. Check the portfolio name.' }, { status: 404 })
    }
    const portfolioId = slugDoc.data()!.portfolioId as string

    // Look up member
    const memberDoc = await adminDb
      .collection('portfolios').doc(portfolioId)
      .collection('members').doc(username)
      .get()
    if (!memberDoc.exists) {
      return Response.json({ error: 'Username not found in this portfolio.' }, { status: 404 })
    }
    const member = memberDoc.data()!

    // Stable, deterministic Firebase UID for this member
    const uid = `m_${portfolioId}_${username}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 128)

    // Create or update the Firebase Auth user for this member
    try {
      await adminAuth.getUser(uid)
    } catch {
      await adminAuth.createUser({ uid, displayName: member.displayName as string })
    }

    // Persist claims so they survive token refreshes
    await adminAuth.setCustomUserClaims(uid, {
      portfolioId,
      portfolioSlug,
      role:     member.role,
      username,
    })

    // Issue a custom token (client will exchange it for a full Firebase session)
    const token = await adminAuth.createCustomToken(uid)

    // Fetch portfolio display name for the response
    const portfolioDoc = await adminDb.collection('portfolios').doc(portfolioId).get()
    const portfolio    = portfolioDoc.data()!

    return Response.json({
      token,
      member: {
        username:    member.username    as string,
        displayName: member.displayName as string,
        role:        member.role        as string,
      },
      portfolio: {
        id:          portfolioId,
        displayName: portfolio.displayName as string,
        slug:        portfolioSlug,
      },
    })
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
