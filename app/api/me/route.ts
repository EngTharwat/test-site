import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // Member or admin with portfolio claims already set
    const portfolioId = user.portfolioId as string | undefined
    const role        = user.role        as string | undefined

    if (portfolioId && role) {
      const doc = await adminDb.collection('portfolios').doc(portfolioId).get()
      if (!doc.exists) return Response.json({ error: 'Portfolio not found' }, { status: 404 })
      const p = doc.data()!
      return Response.json({
        role,
        portfolioId,
        portfolioSlug:  p.slug,
        portfolioName:  p.displayName,
        username:       (user.username as string | undefined) ?? null,
        needsPortfolio: false,
      })
    }

    // Admin without claims: look up by owner UID
    const snap = await adminDb.collection('portfolios')
      .where('adminUserId', '==', user.uid)
      .limit(1)
      .get()

    if (snap.empty) {
      // Email/password user without a portfolio — still an admin, just needs setup
      return Response.json({
        role: 'admin', portfolioId: null, portfolioSlug: null,
        portfolioName: null, username: null, needsPortfolio: true,
      })
    }

    const portfolio = { id: snap.docs[0].id, ...snap.docs[0].data() } as any
    return Response.json({
      role:           'admin',
      portfolioId:    portfolio.id,
      portfolioSlug:  portfolio.slug,
      portfolioName:  portfolio.displayName,
      username:       null,
      needsPortfolio: false,
    })
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
