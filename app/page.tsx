'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

/* ── Logo icon ─────────────────────────────────────────── */
function BoardIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="9" fill="#2563EB" />
      <rect x="7"  y="7"  width="8" height="22" rx="2.5" fill="white" fillOpacity="0.95" />
      <rect x="19" y="7"  width="8" height="13" rx="2.5" fill="white" fillOpacity="0.65" />
      <rect x="19" y="23" width="8" height="6"  rx="2.5" fill="white" fillOpacity="0.4"  />
    </svg>
  )
}

/* ── Demo board mockup ──────────────────────────────────── */
function DemoBoard() {
  const cols = [
    {
      label: 'To Do',
      cards: ['Design wireframes', 'Set up Firebase', 'Write API docs', 'Review specs'],
    },
    {
      label: 'In Progress',
      cards: ['Build login page', 'Create board view', 'API integration'],
    },
    {
      label: 'Done',
      cards: ['Project setup', 'Auth flow', 'Dashboard UI'],
    },
  ]

  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-2xl border border-blue-800/20">
      {/* Browser-like top bar */}
      <div className="bg-gray-800 px-4 py-2.5 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500/80" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
        <span className="w-3 h-3 rounded-full bg-green-500/80" />
        <div className="ml-3 flex-1 bg-gray-700 rounded text-gray-400 text-xs px-3 py-1">
          pmboards.com/board/my-project
        </div>
      </div>

      {/* Board header */}
      <div className="bg-blue-700 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BoardIcon size={22} />
          <span className="text-white font-semibold text-sm">PMBoards</span>
        </div>
        <span className="text-blue-200 text-xs">My Project Board</span>
      </div>

      {/* Columns */}
      <div className="bg-blue-600 p-4 flex gap-3">
        {cols.map((col) => (
          <div key={col.label} className="flex-1 bg-white/15 rounded-xl p-3">
            <h4 className="text-white text-xs font-semibold mb-2.5 px-0.5">{col.label}</h4>
            <div className="flex flex-col gap-1.5">
              {col.cards.map((card) => (
                <div
                  key={card}
                  className="bg-white rounded-lg px-2.5 py-2 text-xs text-gray-700 shadow-sm font-medium"
                >
                  {card}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── LinkedIn icon ──────────────────────────────────────── */
function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

/* ── WhatsApp icon ──────────────────────────────────────── */
function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

/* ── Landing page ───────────────────────────────────────── */
export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Redirect logged-in users straight to their dashboard
  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  // Don't flash the landing page while checking auth
  if (loading) return null

  return (
    <div className="md:h-screen md:overflow-hidden flex flex-col bg-gray-50">

      {/* ── Nav ─────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <BoardIcon />
          <span className="text-xl font-bold text-gray-900 tracking-tight">PMBoards</span>
        </div>
        <button
          onClick={() => router.push('/login')}
          className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* ── Hero + Demo ─────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-8 py-8 md:py-0 overflow-hidden">
        <div className="w-full max-w-5xl flex flex-col md:flex-row items-center gap-10 md:gap-16">

          {/* Left: text + CTA */}
          <div className="flex-shrink-0 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
              <BoardIcon size={48} />
              <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
                PM<span className="text-blue-600">Boards</span>
              </h1>
            </div>
            <p className="text-xl text-gray-500 mb-2 font-medium">
              Your boards. Your workflow.
            </p>
            <p className="text-sm text-gray-400 mb-8 max-w-xs mx-auto md:mx-0">
              Organize tasks visually with lists and cards — simple, fast, and yours.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-7 py-3 rounded-xl text-sm transition-colors shadow-lg shadow-blue-200 inline-flex items-center gap-2"
            >
              Create a project
              <span className="text-lg leading-none">→</span>
            </button>
          </div>

          {/* Right: demo board */}
          <div className="flex-1 w-full min-w-0 max-w-2xl">
            <DemoBoard />
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="flex-shrink-0 flex items-center justify-between px-8 py-4 bg-white border-t border-gray-100">
        <span className="text-sm text-gray-400">
          © {new Date().getFullYear()} <span className="text-gray-600 font-medium">Mohamed Tharwat</span>
        </span>
        <div className="flex items-center gap-5">
          <a
            href="https://www.linkedin.com/in/engtharwat2023"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
          >
            <LinkedInIcon />
            <span className="hidden sm:inline">LinkedIn</span>
          </a>
          <a
            href="https://wa.me/966562085080"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 transition-colors"
          >
            <WhatsAppIcon />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </footer>

    </div>
  )
}
