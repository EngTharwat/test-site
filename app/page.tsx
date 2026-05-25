'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

/* ─────────────────────────────────────────────────────────
   Logo: three growing vertical bars in a rounded square
   Two variants — outline (light bg) and filled (dark bg)
───────────────────────────────────────────────────────── */
function LogoIcon({ size = 34, variant = 'outline' }: { size?: number; variant?: 'outline' | 'filled' }) {
  const w = Math.round(size * 1.5)   // 120:80 = 1.5 ratio
  const c = variant === 'filled' ? 'white' : 'black'
  return (
    <svg width={w} height={size} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer icon — 120×80, border 5, radius 13, padding 10 */}
      <rect x="2.5" y="2.5" width="115" height="75" rx="13" stroke={c} strokeWidth="5" fill="none" />
      {/* Card — 30×30, centered vertically, x offset from flex centering */}
      <rect x="22.5" y="25" width="30" height="30" rx="5" stroke={c} strokeWidth="5" fill="none" />
      {/* Bars — width 5, gap 10, bottom-aligned: heights 20/30/40 */}
      <rect x="62.5" y="50" width="5" height="20" rx="2.5" fill={c} />
      <rect x="77.5" y="40" width="5" height="30" rx="2.5" fill={c} />
      <rect x="92.5" y="30" width="5" height="40" rx="2.5" fill={c} />
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────
   Demo board mockup — dark dashboard style
───────────────────────────────────────────────────────── */
function DemoBoard() {
  const cols = [
    {
      label: 'To Do',
      cards: ['Design wireframes', 'Set up Firebase', 'Write API docs'],
    },
    {
      label: 'In Progress',
      cards: ['Build login page', 'Create board view'],
    },
    {
      label: 'Done',
      cards: ['Project setup', 'Auth flow', 'Dashboard UI'],
    },
  ]

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-gray-200 shadow-[0_32px_80px_rgba(0,0,0,.12),0_2px_8px_rgba(0,0,0,.06)]">
      {/* Browser bar */}
      <div className="bg-black px-4 py-3 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-[#6B7280] text-xs">pmboards.com/board/my-project</span>
      </div>

      {/* Body */}
      <div className="bg-[#0F1115] grid grid-cols-[160px_1fr] min-h-[320px]">
        {/* Sidebar */}
        <div className="bg-[#161B22] border-r border-white/5 py-4">
          <div className="flex items-center gap-2 px-3 pb-3 mb-2 border-b border-white/5">
            <LogoIcon size={18} variant="filled" />
            <span className="text-white text-xs font-semibold">PMBoards</span>
          </div>
          {['Home', 'Projects', 'Tasks', 'Calendar', 'Reports'].map((item, i) => (
            <div
              key={item}
              className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                i === 0
                  ? 'text-white bg-white/7 rounded-md mx-2 px-2'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {item}
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="p-4">
          <div className="text-white text-sm font-bold mb-3">My Project Board</div>
          <div className="flex gap-3">
            {cols.map((col) => (
              <div key={col.label} className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
                <div className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-2.5">
                  {col.label}
                </div>
                <div className="flex flex-col gap-1.5">
                  {col.cards.map((card) => (
                    <div
                      key={card}
                      className="bg-white/[0.06] rounded-lg px-2.5 py-2 text-[11px] text-white/75 font-medium border border-white/[0.06]"
                    >
                      {card}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Social icons
───────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────
   Landing page
───────────────────────────────────────────────────────── */
export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  if (loading) return null

  return (
    <div className="md:h-screen md:overflow-hidden flex flex-col bg-white">

      {/* ── NAV ─────────────────────────────────────────── */}
      <nav
        className="flex-shrink-0 flex items-center justify-between px-12 py-4 bg-white/95 backdrop-blur border-b border-[#F3F4F6]"
        style={{ fontFamily: 'var(--font)' }}
      >
        <div className="flex items-center gap-2.5">
          <LogoIcon size={34} variant="outline" />
          <span className="text-[19px] font-bold text-black tracking-[-0.5px]">PMBoards</span>
        </div>
        <button
          onClick={() => router.push('/login')}
          className="text-[13px] font-500 text-black bg-black text-white border-none rounded-lg px-5 py-2 cursor-pointer transition-all hover:-translate-y-px"
          style={{ fontWeight: 600, color: 'white', background: 'black' }}
        >
          Sign in
        </button>
      </nav>

      {/* ── HERO ────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-12 py-8 md:py-0 overflow-hidden relative">

        {/* Subtle grid + radial glow background */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 40%, rgba(37,99,255,.06) 0%, transparent 50%),
              radial-gradient(circle at 80% 60%, rgba(124,58,237,.05) 0%, transparent 50%),
              linear-gradient(rgba(0,0,0,.035) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,.035) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 100% 100%, 32px 32px, 32px 32px',
          }}
        />

        <div className="relative z-10 w-full max-w-5xl flex flex-col md:flex-row items-center gap-10 md:gap-16">

          {/* Left: text + CTA */}
          <div className="flex-shrink-0 text-center md:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 bg-[#F3F4F6] border border-[#D1D5DB] rounded-full px-3.5 py-1.5 text-[12px] font-medium text-[#374151] mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2563FF]" />
              Plan. Track. Progress.
            </div>

            <h1
              className="text-[clamp(36px,5vw,64px)] font-bold leading-[1.05] tracking-[-2px] text-black max-w-xs mb-4"
              style={{ letterSpacing: '-2px' }}
            >
              Your boards.<br />
              Your <span style={{ color: '#2563FF' }}>workflow.</span>
            </h1>

            <p className="text-[15px] text-[#6B7280] leading-[1.7] max-w-[320px] mb-8 mx-auto md:mx-0">
              Organize tasks visually with lists and cards. Simple, fast, and built for teams that move fast.
            </p>

            <div className="flex items-center gap-3 flex-wrap justify-center md:justify-start">
              <button
                onClick={() => router.push('/login')}
                className="text-[15px] font-semibold text-white bg-black border-none rounded-[10px] px-7 py-3.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,.15)]"
              >
                Create a project →
              </button>
              <button
                onClick={() => router.push('/login')}
                className="text-[15px] font-medium text-black bg-transparent border border-[#D1D5DB] rounded-[10px] px-7 py-3.5 cursor-pointer transition-all hover:border-black"
              >
                Sign in
              </button>
            </div>
          </div>

          {/* Right: demo board */}
          <div className="flex-1 w-full min-w-0 max-w-2xl">
            <DemoBoard />
          </div>
        </div>
      </main>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer className="flex-shrink-0 flex items-center justify-between px-12 py-4 bg-white border-t border-[#F3F4F6]">
        <div className="flex items-center gap-2.5">
          <LogoIcon size={20} variant="outline" />
          <div>
            <span className="text-[13px] font-semibold text-black block leading-tight">PMBoards</span>
            <span className="text-[11px] text-[#6B7280]">
              © {new Date().getFullYear()} Mohamed Tharwat
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://www.linkedin.com/in/engtharwat2023"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[13px] text-[#374151] no-underline transition-colors hover:text-[#2563FF]"
          >
            <LinkedInIcon />
            <span className="hidden sm:inline">LinkedIn</span>
          </a>
          <a
            href="https://wa.me/966562085080"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[13px] text-[#374151] no-underline transition-colors hover:text-[#22c55e]"
          >
            <WhatsAppIcon />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </footer>

    </div>
  )
}
