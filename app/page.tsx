'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

function LogoIcon({ size = 34, variant = 'outline' }: { size?: number; variant?: 'outline' | 'filled' }) {
  const w = Math.round(size * 1.5)
  const c = variant === 'filled' ? 'white' : 'black'
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

export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  if (loading) return null

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* ── NAV ─────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 md:px-12 py-4 border-b border-[#F3F4F6]">
        <div className="flex items-center gap-2.5">
          <LogoIcon size={30} variant="outline" />
          <span className="text-[18px] font-bold text-black tracking-[-0.5px]">PMBoards</span>
        </div>
        <button
          onClick={() => router.push('/login')}
          className="text-[13px] font-semibold text-[#374151] hover:text-black transition-colors"
        >
          Sign in →
        </button>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-full px-3.5 py-1.5 text-[12px] font-medium text-[#374151] mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2563FF]" />
          PMO Platform for Sewer Network Projects
        </div>

        <h1 className="text-[clamp(36px,6vw,68px)] font-bold leading-[1.05] tracking-[-2.5px] text-black max-w-2xl mb-5">
          One platform.<br />
          <span style={{ color: '#2563FF' }}>Your whole team.</span>
        </h1>

        <p className="text-[16px] text-[#6B7280] leading-[1.7] max-w-lg mb-14">
          Portfolio admins manage projects, zones, and cash flow. Team members get
          role-matched access — what they need, nothing more.
        </p>

        {/* ── TWO CTA CARDS ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">

          {/* Create Portfolio — Admin */}
          <div className="bg-[#0F1115] rounded-2xl p-8 text-left flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-5">
              <LogoIcon size={18} variant="filled" />
            </div>
            <h2 className="text-[18px] font-bold text-white tracking-[-0.4px] mb-2">
              Create a Portfolio
            </h2>
            <p className="text-[13px] text-white/50 leading-relaxed mb-6 flex-1">
              Register as an admin, set up your company portfolio, add projects,
              and invite your team.
            </p>
            <button
              onClick={() => router.push('/register')}
              className="w-full bg-[#2563FF] hover:bg-[#1d4fd8] text-white text-[14px] font-semibold py-3 rounded-xl transition-colors"
            >
              Get Started →
            </button>
            <p className="text-[11px] text-white/30 mt-3 text-center">Admin registration</p>
          </div>

          {/* Team Login */}
          <div className="bg-white rounded-2xl p-8 text-left flex flex-col border border-gray-200">
            <div className="w-10 h-10 rounded-xl bg-[#F3F4F6] flex items-center justify-center mb-5 text-xl">
              👥
            </div>
            <h2 className="text-[18px] font-bold text-black tracking-[-0.4px] mb-2">
              Join Your Team
            </h2>
            <p className="text-[13px] text-[#6B7280] leading-relaxed mb-6 flex-1">
              Your admin has already set up the portfolio. Enter your portfolio name
              and username to access your workspace.
            </p>
            <button
              onClick={() => router.push('/login?tab=member')}
              className="w-full bg-black hover:bg-[#0F1115] text-white text-[14px] font-semibold py-3 rounded-xl transition-colors"
            >
              Log In →
            </button>
            <p className="text-[11px] text-[#9CA3AF] mt-3 text-center">No password required</p>
          </div>
        </div>

        {/* Role chips */}
        <div className="flex flex-wrap justify-center gap-2 mt-10">
          {[
            { role: 'Admin',           color: 'bg-purple-100 text-purple-700' },
            { role: 'Project Manager', color: 'bg-blue-100 text-blue-700' },
            { role: 'Site Engineer',   color: 'bg-orange-100 text-orange-700' },
            { role: 'Surveyor',        color: 'bg-green-100 text-green-700' },
          ].map(r => (
            <span key={r.role} className={`text-[11px] font-semibold px-3 py-1 rounded-full ${r.color}`}>
              {r.role}
            </span>
          ))}
        </div>

      </main>

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer className="flex items-center justify-between px-8 md:px-12 py-4 border-t border-[#F3F4F6]">
        <div className="flex items-center gap-2">
          <LogoIcon size={18} variant="outline" />
          <span className="text-[12px] text-[#6B7280]">
            © {new Date().getFullYear()} Mohamed Tharwat
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://www.linkedin.com/in/engtharwat2023" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-[12px] text-[#374151] hover:text-[#2563FF] transition-colors">
            <LinkedInIcon /><span className="hidden sm:inline">LinkedIn</span>
          </a>
          <a href="https://wa.me/966562085080" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-[12px] text-[#374151] hover:text-[#22c55e] transition-colors">
            <WhatsAppIcon /><span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </footer>
    </div>
  )
}
