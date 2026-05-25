'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

// ── Logo ─────────────────────────────────────────────────────────────────────
function LogoIcon({ size = 22 }: { size?: number }) {
  const w = Math.round(size * 1.5)
  return (
    <svg width={w} height={size} viewBox="0 0 120 80" fill="none">
      {/* Outer landscape rectangle — border only */}
      <rect x="2.5" y="2.5" width="115" height="75" rx="13" stroke="white" strokeWidth="5" fill="none" />
      {/* Card: small outlined square */}
      <rect x="17.5" y="27.5" width="25" height="25" rx="4" stroke="white" strokeWidth="5" fill="none" />
      {/* Growing bars — bottom-aligned */}
      <rect x="63" y="45" width="5" height="20" rx="2.5" fill="white" />
      <rect x="76" y="35" width="5" height="30" rx="2.5" fill="white" />
      <rect x="89" y="25" width="5" height="40" rx="2.5" fill="white" />
    </svg>
  )
}

// ── Nav Icons ────────────────────────────────────────────────────────────────
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
  href: string
  icon: () => React.ReactElement
  label: string
  active: boolean
  disabled?: boolean
}) {
  const base = 'flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors select-none'
  if (disabled) return (
    <div className={`${base} text-white/20 cursor-not-allowed`}>
      <IconComp />
      {label}
      <span className="ml-auto text-[9px] text-white/20 font-normal">Soon</span>
    </div>
  )
  return (
    <Link
      href={href}
      className={`${base} ${
        active
          ? 'bg-white/[0.08] text-white'
          : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
      }`}
    >
      <IconComp />
      {label}
    </Link>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ user, onSignOut }: { user: { email: string | null }; onSignOut: () => void }) {
  const pathname = usePathname()

  // Extract projectId from URL: /projects/[id]/...
  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const projectId    = projectMatch?.[1] ?? null
  const inProject    = !!projectId

  const is = (path: string) => pathname === path || pathname.startsWith(path + '/')

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#0F1115] flex flex-col border-r border-white/[0.06] h-screen sticky top-0">

      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2.5 px-4 py-5 border-b border-white/[0.06] hover:opacity-80 transition-opacity">
        <LogoIcon size={24} />
        <span className="text-white text-[15px] font-bold tracking-[-0.4px]">PMBoards</span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto flex flex-col gap-0.5">

        {/* Portfolio */}
        <NavItem
          href="/dashboard"
          icon={Icon.Portfolio}
          label="Portfolio"
          active={pathname === '/dashboard'}
        />

        {/* Project-specific nav */}
        {inProject && (
          <>
            <div className="mx-4 my-2 border-t border-white/[0.06]" />

            {/* Back */}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 mx-2 px-2.5 py-1.5 text-white/30 hover:text-white/60 text-[11px] transition-colors"
            >
              <Icon.Back />
              Back to Portfolio
            </Link>

            <div className="px-4 py-1.5">
              <span className="text-[10px] font-semibold text-white/25 uppercase tracking-widest">Project</span>
            </div>

            <NavItem
              href={`/projects/${projectId}`}
              icon={Icon.Overview}
              label="Overview"
              active={pathname === `/projects/${projectId}`}
            />
            <NavItem
              href={`/projects/${projectId}/zones`}
              icon={Icon.Zones}
              label="Zones"
              active={is(`/projects/${projectId}/zones`)}
            />
            <NavItem
              href={`/projects/${projectId}/segments`}
              icon={Icon.Segments}
              label="Segments"
              active={is(`/projects/${projectId}/segments`)}
            />
            <NavItem
              href={`/projects/${projectId}/progress`}
              icon={Icon.Progress}
              label="Progress"
              active={is(`/projects/${projectId}/progress`)}
            />
            <NavItem
              href={`/projects/${projectId}/cashflow`}
              icon={Icon.CashFlow}
              label="Cash Flow"
              active={is(`/projects/${projectId}/cashflow`)}
            />
            <NavItem
              href={`/projects/${projectId}/map`}
              icon={Icon.Map}
              label="Map / GIS"
              active={false}
              disabled
            />
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/[0.06] p-4">
        <p className="text-[11px] text-white/40 truncate mb-2">{user.email}</p>
        <button
          onClick={onSignOut}
          className="text-[11px] text-white/30 hover:text-white/70 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth()
  const router  = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  if (loading || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0F1115]">
        <LogoIcon size={32} />
      </div>
    )
  }

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F4F6]">

      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar user={user} onSignOut={handleSignOut} />
      </div>

      {/* Mobile sidebar overlay */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="flex-shrink-0">
            <Sidebar user={user} onSignOut={handleSignOut} />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0F1115] border-b border-white/[0.06]">
          <button onClick={() => setMenuOpen(true)} className="text-white/60 hover:text-white">
            <Icon.Menu />
          </button>
          <LogoIcon size={20} />
          <span className="text-white text-[14px] font-bold">PMBoards</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
