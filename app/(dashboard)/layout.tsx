'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { getProjectPagePermissions } from '@/lib/permissions'
import { ThemeToggle } from '@/lib/theme-toggle'

// ── Logo ─────────────────────────────────────────────────────────────────────
function LogoIcon({ size = 22 }: { size?: number }) {
  const w = Math.round(size * 1.5)
  return (
    <svg width={w} height={size} viewBox="0 0 120 80" fill="none">
      <rect x="2.5"  y="2.5"  width="115" height="75" rx="13" stroke="white" strokeWidth="5" fill="none" />
      <rect x="22.5" y="22.5" width="35"  height="35" rx="5"  stroke="white" strokeWidth="5" fill="none" />
      <rect x="67.5" y="40"   width="5"   height="20" rx="2.5" fill="white" />
      <rect x="82.5" y="30"   width="5"   height="30" rx="2.5" fill="white" />
      <rect x="97.5" y="20"   width="5"   height="40" rx="2.5" fill="white" />
    </svg>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  Portfolio: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  Overview: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Zones: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  ),
  Segments: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  Progress: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
    </svg>
  ),
  Permits: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="m9 15 2 2 4-4"/>
    </svg>
  ),
  CashFlow: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  Map: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    </svg>
  ),
  Boq: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3"/>
      <rect x="9" y="1" width="6" height="4" rx="1"/>
      <line x1="8" y1="11" x2="13" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>
      <line x1="16" y1="11" x2="16" y2="11"/><line x1="16" y1="15" x2="16" y2="15"/>
    </svg>
  ),
  Invoices: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2h14a1 1 0 0 1 1 1v18l-3-2-3 2-3-2-3 2-3-2V3a1 1 0 0 1 1-1z"/>
      <line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>
    </svg>
  ),
  Team: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Back: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  ),
  Menu: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
}

// ── Nav Item ──────────────────────────────────────────────────────────────────
function NavItem({
  href, icon: IconComp, label, active, disabled = false,
}: {
  href: string; icon: () => React.ReactElement; label: string
  active: boolean; disabled?: boolean
}) {
  const base = 'flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors select-none'
  if (disabled) return (
    <div className={`${base} text-white/20 cursor-not-allowed`}>
      <IconComp />{label}
      <span className="ml-auto text-[9px] text-white/20 font-normal">Soon</span>
    </div>
  )
  return (
    <Link href={href} className={`${base} ${
      active ? 'bg-white/[0.08] text-white' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
    }`}>
      <IconComp />{label}
    </Link>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({
  userEmail, onSignOut,
}: {
  userEmail: string | null; onSignOut: () => void
}) {
  const { profile } = useAuth()
  const pathname    = usePathname()

  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const projectId    = projectMatch?.[1] ?? null
  const inProject    = !!projectId

  const isAdmin = profile?.isAdmin ?? false
  const perms   = profile?.permissions ?? null

  // For members: resolve per-project page permissions
  const pagePerm = (!isAdmin && perms && projectId)
    ? getProjectPagePermissions(perms, projectId)
    : null

  const is = (path: string) => pathname === path || pathname.startsWith(path + '/')

  // Determine which top-level nav items a member can see
  const canSeePortfolio = isAdmin
    || (perms?.project_scope === 'all')
    || ((perms?.project_ids ?? []).length > 0)

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#171d28] flex flex-col border-r border-white/[0.06] h-screen sticky top-0">

      {/* Logo + portfolio name */}
      <Link href="/dashboard" className="flex items-center gap-2.5 px-4 py-5 border-b border-white/[0.06] hover:opacity-80 transition-opacity">
        <LogoIcon size={24} />
        <div className="min-w-0">
          <div className="text-white text-[14px] font-bold tracking-[-0.4px] truncate">
            {profile?.portfolioName ?? 'PMBoards'}
          </div>
          {profile?.portfolioSlug && (
            <div className="text-white/30 text-[10px] font-mono truncate">{profile.portfolioSlug}</div>
          )}
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto flex flex-col gap-0.5">

        {canSeePortfolio && (
          <NavItem
            href="/dashboard"
            icon={Icon.Portfolio}
            label="Portfolio"
            active={pathname === '/dashboard'}
          />
        )}

        {isAdmin && (
          <NavItem
            href="/admin/members"
            icon={Icon.Team}
            label="Team"
            active={is('/admin/members')}
          />
        )}

        {inProject && (
          <>
            <div className="mx-4 my-2 border-t border-white/[0.06]" />

            {canSeePortfolio && (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 mx-2 px-2.5 py-1.5 text-white/30 hover:text-white/60 text-[11px] transition-colors"
              >
                <Icon.Back />
                Back to Portfolio
              </Link>
            )}

            <div className="px-4 py-1.5">
              <span className="text-[10px] font-semibold text-white/25 uppercase tracking-widest">Project</span>
            </div>

            {(isAdmin || (pagePerm && pagePerm.overview !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}`}
                icon={Icon.Overview}
                label="Overview"
                active={pathname === `/projects/${projectId}`}
              />
            )}

            {(isAdmin || (pagePerm && pagePerm.zones !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}/zones`}
                icon={Icon.Zones}
                label="Areas"
                active={is(`/projects/${projectId}/zones`)}
              />
            )}

            {(isAdmin || (pagePerm && (pagePerm.boq ?? 'none') !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}/boq`}
                icon={Icon.Boq}
                label="BOQ"
                active={is(`/projects/${projectId}/boq`)}
              />
            )}

            {(isAdmin || (pagePerm && (pagePerm.invoices ?? 'none') !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}/invoices`}
                icon={Icon.Invoices}
                label="Invoices"
                active={is(`/projects/${projectId}/invoices`)}
              />
            )}

            {(isAdmin || (pagePerm && pagePerm.segments !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}/segments`}
                icon={Icon.Segments}
                label="Segments"
                active={is(`/projects/${projectId}/segments`)}
              />
            )}

            {(isAdmin || (pagePerm && pagePerm.progress !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}/progress`}
                icon={Icon.Progress}
                label="Progress"
                active={is(`/projects/${projectId}/progress`)}
              />
            )}

            {(isAdmin || (pagePerm && pagePerm.permits !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}/permits`}
                icon={Icon.Permits}
                label="Permits"
                active={is(`/projects/${projectId}/permits`)}
              />
            )}

            {(isAdmin || (pagePerm && pagePerm.cash_flow !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}/cashflow`}
                icon={Icon.CashFlow}
                label="Cash Flow"
                active={is(`/projects/${projectId}/cashflow`)}
              />
            )}

            {(isAdmin || (pagePerm && pagePerm.map !== 'none')) && (
              <NavItem
                href={`/projects/${projectId}/map`}
                icon={Icon.Map}
                label="Map / GIS"
                active={is(`/projects/${projectId}/map`)}
              />
            )}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/[0.06] p-4 space-y-2">
        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          isAdmin ? 'bg-purple-500/20 text-purple-300' : 'bg-white/10 text-white/50'
        }`}>
          {isAdmin ? 'Admin' : 'Member'}
        </span>
        <p className="text-[11px] text-white/40 truncate">
          {profile?.username ? `@${profile.username}` : userEmail}
        </p>
        <div className="flex items-center justify-between">
          <button
            onClick={onSignOut}
            className="text-[11px] text-white/30 hover:text-white/70 transition-colors"
          >
            Sign out
          </button>
          {/* Dark mode toggle in sidebar footer */}
          <ThemeToggle className="w-7 h-7 text-white/40 hover:text-white hover:bg-white/5 rounded-md" />
        </div>
      </div>
    </aside>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, profile, profileLoading, profileError, refreshProfile, signOut } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (!profile || profileLoading) return
    if (!profile.role) return

    if (
      profile.needsPortfolio &&
      pathname !== '/register' &&
      !pathname.startsWith('/admin')
    ) {
      router.replace('/register')
      return
    }
  }, [profile, profileLoading, pathname, router])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#171d28]">
        <LogoIcon size={32} />
      </div>
    )
  }

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  // The backend couldn't load the account (e.g. Firestore quota/outage). Show a
  // retry state rather than silently rendering a misleading "member" shell.
  if (user && profileError && !profile && !profileLoading) {
    const handleRetry = async () => {
      setRetrying(true)
      try { await refreshProfile() } finally { setRetrying(false) }
    }
    return (
      <div className="h-screen flex items-center justify-center bg-[#F3F4F6] dark:bg-[#1a202c] px-6">
        <div className="max-w-md text-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-sm">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-lg font-bold text-black dark:text-white mb-2">Couldn’t load your account</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mb-1">
            We reached the sign-in service but couldn’t load your portfolio data right now.
          </p>
          <p className="text-[12px] text-[#9CA3AF] dark:text-gray-500 mb-6">
            This is usually a temporary backend/quota issue — your projects and admin access are safe. Try again in a moment.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleRetry} disabled={retrying}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
            <button onClick={handleSignOut}
              className="text-sm font-semibold text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    // Outer shell — dark:bg covers the gutter between sidebar and content
    <div className="flex h-screen overflow-hidden bg-[#F3F4F6] dark:bg-[#1a202c]">

      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar userEmail={user?.email ?? null} onSignOut={handleSignOut} />
      </div>

      {/* Mobile sidebar overlay */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="flex-shrink-0">
            <Sidebar userEmail={user?.email ?? null} onSignOut={handleSignOut} />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#171d28] border-b border-white/[0.06]">
          <button onClick={() => setMenuOpen(true)} className="text-white/60 hover:text-white">
            <Icon.Menu />
          </button>
          <LogoIcon size={20} />
          <span className="text-white text-[14px] font-bold">
            {profile?.portfolioName ?? 'PMBoards'}
          </span>
          {/* Dark mode toggle in mobile topbar */}
          <div className="ml-auto">
            <ThemeToggle className="w-8 h-8 text-white/50 hover:text-white hover:bg-white/5 rounded-md" />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto dark:bg-[#1a202c]">
          {children}
        </main>
      </div>
    </div>
  )
}
