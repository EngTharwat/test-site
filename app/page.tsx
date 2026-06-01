'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Theme icons ───────────────────────────────────────────────────────────────
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

// ── Logo ──────────────────────────────────────────────────────────────────────
// variant='filled' → white (for dark sidebars)
// variant='outline' → currentColor (inherits from parent text color, dark-mode-safe)
function LogoIcon({ size = 34, variant = 'outline' }: { size?: number; variant?: 'outline' | 'filled' }) {
  const w = Math.round(size * 1.5)
  const c = variant === 'filled' ? 'white' : 'currentColor'
  return (
    <svg width={w} height={size} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5"  y="2.5"  width="115" height="75" rx="13" stroke={c} strokeWidth="5" fill="none" />
      <rect x="22.5" y="22.5" width="35"  height="35" rx="5"  stroke={c} strokeWidth="5" fill="none" />
      <rect x="67.5" y="40"   width="5"   height="20" rx="2.5" fill={c} />
      <rect x="82.5" y="30"   width="5"   height="30" rx="2.5" fill={c} />
      <rect x="97.5" y="20"   width="5"   height="40" rx="2.5" fill={c} />
    </svg>
  )
}

// ── Social icons ──────────────────────────────────────────────────────────────
function LinkedInIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_STATS = [
  { label: 'Total Projects',  value: '4',          sub: '3 active' },
  { label: 'Contract Value',  value: 'SAR 126.6M', sub: 'across portfolio' },
  { label: 'Network Length',  value: '35.3 km',    sub: 'all projects' },
  { label: 'Avg. Completion', value: '51%',         sub: 'portfolio progress' },
]

const DEMO_PROJECTS = [
  {
    name: 'NWC Phase 1 — Riyadh North Sewer',
    client: 'NWC · Sewer Network',
    status: 'Active',
    statusCls: 'bg-green-100 text-green-700',
    pct: 67,
    value: 'SAR 45.5M',
    barColor: '#f97316',
  },
  {
    name: 'Water Main Replacement — Central District',
    client: 'NWC · Water Network',
    status: 'Active',
    statusCls: 'bg-green-100 text-green-700',
    pct: 34,
    value: 'SAR 28.2M',
    barColor: '#2563FF',
  },
  {
    name: 'Storm Drainage — Al Nakheel',
    client: 'Municipality · Storm',
    status: 'Planning',
    statusCls: 'bg-gray-100 text-gray-500',
    pct: 12,
    value: 'SAR 19.8M',
    barColor: '#2563FF',
  },
  {
    name: 'Sewer Rehabilitation — Zone B',
    client: 'NWC · Sewer Network',
    status: 'Completed',
    statusCls: 'bg-blue-100 text-blue-700',
    pct: 91,
    value: 'SAR 33.1M',
    barColor: '#22c55e',
  },
]

// ── Demo dashboard component ──────────────────────────────────────────────────
// Interactive, always-dark demo dashboard with a thick high-contrast frame.
const DEMO_TEAM = [
  { name: 'Eng. Sara A.',   role: 'Planning',    scope: 'All projects',     color: 'bg-[#2563FF]' },
  { name: 'Eng. Khalid M.', role: 'Site',        scope: 'Riyadh North',      color: 'bg-[#22c55e]' },
  { name: 'Eng. Noura T.',  role: 'QA / QC',     scope: 'Sewer Rehab',       color: 'bg-[#f97316]' },
  { name: 'Eng. Faisal R.', role: 'Survey',      scope: 'Water Main',        color: 'bg-[#7C3AED]' },
]

function DemoDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<'portfolio' | 'team'>('portfolio')
  const go = () => router.push('/register')

  return (
    <div className="relative w-full" style={{ maxWidth: 700 }}>

      {/* "Demo Preview" badge */}
      <div className="absolute -top-3 -right-3 z-10 bg-[#2563FF] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md">
        Live Demo · click around
      </div>

      {/* Browser chrome — thick high-contrast frame */}
      <div className="rounded-2xl overflow-hidden shadow-2xl border-4 border-[#2563FF] ring-1 ring-black/20 bg-[#0a0a0a]">

        {/* Chrome bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1d23] border-b border-white/10">
          <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <span className="w-3 h-3 rounded-full bg-[#28C840]" />
          <div className="flex-1 mx-3 bg-[#0a0a0a] border border-white/10 rounded-md px-3 py-1 text-[11px] text-white/40 font-mono">
            pmboards.com/dashboard
          </div>
          <div className="flex gap-1">
            {[1,2].map(i => <div key={i} className="w-3 h-3 rounded-sm bg-white/10" />)}
          </div>
        </div>

        {/* App shell */}
        <div className="flex" style={{ height: 430 }}>

          {/* Sidebar */}
          <div className="w-[150px] flex-shrink-0 bg-[#0F1115] flex flex-col border-r border-white/[0.06]">
            <div className="flex items-center gap-1.5 px-3 py-3 border-b border-white/[0.06]">
              <LogoIcon size={13} variant="filled" />
              <span className="text-white text-[11px] font-bold tracking-tight">PMBoards</span>
            </div>
            <nav className="flex-1 p-2 space-y-px">
              {([
                { key: 'portfolio', label: 'Portfolio' },
                { key: 'team',      label: 'Team' },
              ] as const).map(item => {
                const active = tab === item.key
                return (
                  <button key={item.key} onClick={() => setTab(item.key)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                      active ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.05]'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-[2px] ${active ? 'bg-[#2563FF]' : 'bg-white/20'}`} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
            <div className="px-3 py-2.5 border-t border-white/[0.06]">
              <div className="text-[9px] text-white/30 truncate mb-1">admin@nwc.sa</div>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">Admin</span>
            </div>
          </div>

          {/* Main content — dark */}
          <div className="flex-1 overflow-y-auto bg-[#0a0a0a] p-4 space-y-3">

            <div className="flex items-start justify-between">
              <div>
                <div className="text-[13px] font-bold text-white tracking-tight">{tab === 'portfolio' ? 'Portfolio' : 'Team'}</div>
                <div className="text-[10px] text-white/40">
                  {tab === 'portfolio' ? 'All active and planned projects' : 'Members & their access scope'}
                </div>
              </div>
              <button onClick={go}
                className="bg-white text-black text-[9px] font-semibold px-2.5 py-1.5 rounded-lg hover:bg-gray-200 transition-colors">
                {tab === 'portfolio' ? '+ New Project' : '+ Invite Member'}
              </button>
            </div>

            {tab === 'portfolio' ? (
              <>
                {/* KPI cards — 2×2 */}
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_STATS.map(k => (
                    <div key={k.label} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                      <div className="text-[8px] font-semibold text-white/40 uppercase tracking-wider mb-1">{k.label}</div>
                      <div className="text-[13px] font-bold text-white tracking-tight leading-none">{k.value}</div>
                      <div className="text-[8px] text-white/30 mt-1">{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Project cards — 2×2, clickable */}
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_PROJECTS.map((p, i) => (
                    <button key={i} onClick={go}
                      className="text-left bg-gray-900 rounded-xl p-3 border border-gray-800 hover:border-[#2563FF] hover:-translate-y-0.5 transition-all">
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div className="text-[10px] font-semibold text-white leading-tight line-clamp-2 flex-1">{p.name}</div>
                        <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${p.statusCls}`}>
                          {p.status}
                        </span>
                      </div>
                      <div className="text-[9px] text-white/40 mb-1.5">{p.client}</div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-1.5">
                        <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: p.barColor }} />
                      </div>
                      <div className="flex justify-between text-[8px]">
                        <span className="text-white/40">{p.value}</span>
                        <span className="font-bold text-white">{p.pct}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              /* Team view */
              <div className="space-y-2">
                {DEMO_TEAM.map((m, i) => (
                  <button key={i} onClick={go}
                    className="w-full text-left flex items-center gap-3 bg-gray-900 rounded-xl p-2.5 border border-gray-800 hover:border-[#2563FF] transition-colors">
                    <span className={`w-6 h-6 rounded-full ${m.color} flex items-center justify-center text-white text-[9px] font-bold`}>
                      {m.name.split(' ')[1]?.[0] ?? 'E'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold text-white truncate">{m.name}</div>
                      <div className="text-[8px] text-white/40">{m.role} · {m.scope}</div>
                    </div>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">Member</span>
                  </button>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Founder section ───────────────────────────────────────────────────────────
function FounderSection() {
  return (
    <section className="border-t border-[#F3F4F6] dark:border-gray-800 bg-[#F9FAFB] dark:bg-[#111111]">
      <div className="max-w-3xl mx-auto px-6 md:px-8 py-16">

        {/* Section label */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px flex-1 bg-[#E5E7EB] dark:bg-gray-700" />
          <span className="text-[11px] font-semibold text-[#9CA3AF] dark:text-gray-500 uppercase tracking-widest">About the Founder</span>
          <div className="h-px flex-1 bg-[#E5E7EB] dark:bg-gray-700" />
        </div>

        {/* Card */}
        <div className="flex flex-col sm:flex-row items-start gap-6">

          {/* Avatar */}
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-[#0F1115] flex-shrink-0 ring-4 ring-white dark:ring-gray-800 shadow-lg mx-auto sm:mx-0">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white text-[22px] font-bold tracking-[-1px]">MT</span>
            </div>
            <img
              src="/founder.jpg"
              alt="Mohamed Tharwat"
              className="absolute inset-0 w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          {/* Text */}
          <div className="flex-1 text-center sm:text-left">
            <div className="text-[18px] font-bold text-black dark:text-white tracking-[-0.4px]">
              Mohamed Tharwat
            </div>
            <div className="text-[13px] text-[#2563FF] font-medium mt-0.5 mb-3">
              Planning Engineer · PMBoards Founder · NWC Saudi Arabia
            </div>
            {/* FIX 4: updated opening sentence */}
            <p className="text-[13px] text-[#374151] dark:text-gray-300 leading-[1.8] mb-4">
              Civil Planning Engineer with 3 years of experience in Project Control
              and Planning. Currently working with the National Water
              Company (NWC) in Saudi Arabia, certified across three major infrastructure
              projects. Passionate about bridging engineering fundamentals with modern digital
              tools — Power BI, Primavera P6, BIM 4D/5D — to turn raw project data into
              decisions that actually move the needle. PMBoards was born from that vision:
              smart, data-driven project management for everyone.
            </p>
            {/* Social */}
            <div className="flex items-center gap-4 justify-center sm:justify-start">
              <a href="https://www.linkedin.com/in/engtharwat2023" target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-gray-300 hover:text-[#2563FF] dark:hover:text-[#2563FF] transition-colors font-medium">
                <LinkedInIcon /> LinkedIn
              </a>
              <a href="https://wa.me/966562085080" target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-gray-300 hover:text-[#22c55e] dark:hover:text-[#22c55e] transition-colors font-medium">
                <WhatsAppIcon /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Landing page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter()

  // ── Dark mode (default = dark, persisted in localStorage) ──────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('pmboards-theme')
    const initial: 'dark' | 'light' = saved === 'light' ? 'light' : 'dark'
    setTheme(initial)
    document.documentElement.classList.toggle('dark', initial === 'dark')
  }, [])

  function toggleTheme() {
    const next: 'dark' | 'light' = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('pmboards-theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col dot-grid">

      {/* ── NAV ─────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 md:px-12 py-4 bg-white/80 dark:bg-transparent backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        {/* Logo + wordmark */}
        <div className="flex items-center gap-2.5 text-black dark:text-white">
          <LogoIcon size={30} variant="outline" />
          <span className="text-[18px] font-bold tracking-[-0.5px]">PMBoards</span>
        </div>

        {/* Right side: dark mode toggle + hidden sign-in */}
        <div className="flex items-center gap-3">
          {/* FIX 3: dark mode toggle button */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 text-[#374151] dark:text-gray-300 hover:bg-[#F3F4F6] dark:hover:bg-gray-800 transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Sign-in hidden during demo */}
          <button
            onClick={() => router.push('/login')}
            className="text-[13px] font-semibold text-[#374151] hover:text-black transition-colors opacity-0 pointer-events-none select-none"
            aria-hidden="true"
          >
            Sign in →
          </button>
        </div>
      </nav>

      {/* ── HERO — split screen ──────────────────────────────────── */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* ── LEFT COLUMN (40%) — CTA ─────────────────────────── */}
        <div className="lg:w-[40%] flex flex-col justify-center px-8 md:px-12 lg:px-14 py-14 lg:py-0">

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 self-start bg-[#F3F4F6] dark:bg-gray-800 border border-[#E5E7EB] dark:border-gray-700 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-[#374151] dark:text-gray-300 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563FF]" />
            PMO Platform for Infrastructure Projects
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(34px,4.5vw,58px)] font-bold leading-[1.05] tracking-[-2px] text-black dark:text-white mb-5">
            One platform.<br />
            <span style={{ color: '#2563FF' }}>Your whole team.</span>
          </h1>

          {/* Subtext */}
          <p className="text-[15px] text-[#6B7280] dark:text-gray-400 leading-[1.75] max-w-sm mb-9">
            Portfolio admins manage projects, zones, and cash flow. Team members get
            role-matched access — what they need, nothing more.
          </p>

          {/* CTA buttons — stacked  (FIX 1: role chips removed below) */}
          <div className="flex flex-col gap-3 max-w-xs">
            <button
              onClick={() => router.push('/register')}
              className="w-full bg-black dark:bg-white hover:bg-[#0F1115] dark:hover:bg-gray-100 text-white dark:text-black text-[14px] font-semibold py-3.5 rounded-xl transition-colors"
            >
              Create New Portfolio
            </button>
            <button
              onClick={() => router.push('/login?tab=member')}
              className="w-full border-2 border-gray-400 dark:border-gray-600 hover:border-black dark:hover:border-white hover:bg-gray-50 dark:hover:bg-gray-800 text-black dark:text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors"
            >
              Join Your Portfolio
            </button>
          </div>
          {/* FIX 1: role badge chips removed entirely */}
        </div>

        {/* ── RIGHT COLUMN (60%) — Demo ────────────────────────── */}
        <div className="lg:w-[60%] flex items-center justify-center px-6 md:px-10 py-12 lg:py-8 border-t border-[#F3F4F6] dark:border-gray-800 lg:border-t-0 lg:border-l bg-gradient-to-br from-[#F8FAFC] to-[#EEF2FF] dark:from-gray-900 dark:to-gray-800">
          <DemoDashboard />
        </div>

      </main>

      {/* ── FOUNDER SECTION ─────────────────────────────────────── */}
      <FounderSection />

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer className="flex items-center justify-between px-8 md:px-12 py-4 border-t border-[#F3F4F6] dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2 text-black dark:text-white">
          <LogoIcon size={18} variant="outline" />
          <span className="text-[12px] text-[#6B7280] dark:text-gray-400">
            © {new Date().getFullYear()} Mohamed Tharwat
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://www.linkedin.com/in/engtharwat2023" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-gray-300 hover:text-[#2563FF] dark:hover:text-[#2563FF] transition-colors">
            <LinkedInIcon /><span className="hidden sm:inline">LinkedIn</span>
          </a>
          <a href="https://wa.me/966562085080" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-[12px] text-[#374151] dark:text-gray-300 hover:text-[#22c55e] dark:hover:text-[#22c55e] transition-colors">
            <WhatsAppIcon /><span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </footer>
    </div>
  )
}
