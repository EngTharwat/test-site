import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // ── 1. Admin check: Firestore is the source of truth ─────────────────────
    // Query whether this UID owns a portfolio. This works for every admin
    // regardless of token claim state, UID format, or token age.
    const adminSnap = await adminDb
      .collection('portfolios')
      .where('adminUserId', '==', user.uid)
      .limit(1)
      .get()

    if (!adminSnap.empty) {
      const portfolio = { id: adminSnap.docs[0].id, ...adminSnap.docs[0].data() } as any
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
    }

    // ── 2. Member check: token carries portfolioId + username claims ──────────
    const portfolioId = user.portfolioId as string | undefined
    const username    = user.username    as string | undefined

    if (portfolioId && username) {
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
        isAdmin:        false,
        role:           'member',
        permissions,
        portfolioId,
        portfolioSlug:  p.slug,
        portfolioName:  p.displayName,
        username,
        needsPortfolio: false,
      })
    }

    // ── 3. New admin — signed up but hasn't created a portfolio yet ───────────
    return Response.json({
      isAdmin:        true,
      role:           'admin',
      permissions:    null,
      portfolioId:    null,
      portfolioSlug:  null,
      portfolioName:  null,
      username:       null,
      needsPortfolio: true,
    })
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    )
  }
}
