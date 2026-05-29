import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const portfolioId = user.portfolioId as string | undefined
    const username    = user.username    as string | undefined
    const tokenRole   = user.role        as string | undefined

    // ── Member login (has portfolioId + username claims, no 'admin' role claim)
    // NOTE: admins also have portfolioId + username:'admin' in their token claims
    // (set by /api/portfolios POST), so we must exclude them via the role claim.
    if (portfolioId && username && tokenRole !== 'admin') {
      const [portfolioDoc, memberDoc] = await Promise.all([
        adminDb.collection('portfolios').doc(portfolioId).get(),
        adminDb.collection('portfolios').doc(portfolioId)
          .collection('members').doc(username).get(),
      ])

      if (!portfolioDoc.exists) {
        return Response.json({ error: 'Portfolio not found' }, { status: 404 })
      }

      const p           = portfolioDoc.data()!
      const permissions = memberDoc.data()?.permissions ?? null

      return Response.json({
        isAdmin:       false,
        role:          'member',
        permissions,
        portfolioId,
        portfolioSlug:  p.slug,
        portfolioName:  p.displayName,
        username,
        needsPortfolio: false,
      })
    }

    // ── Admin with portfolio claims already set (legacy path) ─────────────────
    // (This path is hit when an admin's token has portfolioId but no username —
    //  shouldn't happen in the new flow, but kept for safety.)

    // ── Admin without claims: look up by owner UID ────────────────────────────
    const snap = await adminDb.collection('portfolios')
      .where('adminUserId', '==', user.uid)
      .limit(1)
      .get()

    if (snap.empty) {
      return Response.json({
        isAdmin: true, role: 'admin', permissions: null,
        portfolioId: null, portfolioSlug: null, portfolioName: null,
        username: null, needsPortfolio: true,
      })
    }

    const portfolio = { id: snap.docs[0].id, ...snap.docs[0].data() } as any
    return Response.json({
      isAdmin:        true,
      role:           'admin',
      permissions:    null,
      portfolioId:    portfolio.id,
      portfolioSlug:  portfolio.slug,
      portfolioName:  portfolio.displayName,
      username:       null,
      needsPortfolio: false,
    })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    )
  }
}
