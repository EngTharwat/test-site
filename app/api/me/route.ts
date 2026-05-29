import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // ── Detect member vs admin by UID structure (claim-independent) ──────────────
    // Member UIDs are always "m_{portfolioId}_{username}" (set in member-login route).
    // Admin UIDs are random Firebase Auth UIDs and never start with "m_".
    // This avoids the bug where admin tokens carry username:'admin' as a claim and
    // would be misrouted into the member path when checked by claims alone.
    const isMember    = user.uid.startsWith('m_')
    const portfolioId = user.portfolioId as string | undefined
    const username    = user.username    as string | undefined

    if (isMember) {
      if (!portfolioId || !username) {
        return Response.json({ error: 'Invalid member token — missing claims' }, { status: 401 })
      }
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
