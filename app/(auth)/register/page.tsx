'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { ThemeToggle } from '@/lib/theme-toggle'
import { LogoIcon } from '@/lib/logo'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

function toSlug(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

export default function RegisterPage() {
  const { user, loading, profile, profileLoading, signUp, refreshProfile } = useAuth()
  const router = useRouter()

  const [step,         setStep]         = useState<1 | 2>(1)
  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [portfolioName,setPortfolioName]= useState('')
  const [slug,         setSlug]         = useState('')
  const [slugEdited,   setSlugEdited]   = useState(false)
  const [error,        setError]        = useState('')
  const [busy,         setBusy]         = useState(false)

  useEffect(() => {
    if (loading || profileLoading) return
    if (!user) return
    if (profile?.needsPortfolio) {
      setStep(2)
    } else if (profile && !profile.needsPortfolio) {
      router.replace('/dashboard')
    }
  }, [user, loading, profile, profileLoading, router])

  function handlePortfolioNameChange(val: string) {
    setPortfolioName(val)
    if (!slugEdited) setSlug(toSlug(val))
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      // If the account was already created (e.g. the user stepped back to
      // review this step), just advance instead of signing up again.
      if (!user) await signUp(email, password)
      setStep(2)
    } catch (err: unknown) {
      const raw  = err instanceof Error ? err.message : String(err)
      const code = raw.match(/\(auth\/([^)]+)\)/)?.[1]
      const map: Record<string, string> = {
        'email-already-in-use': 'That email already has an account.',
        'weak-password':        'Password must be at least 6 characters.',
        'invalid-email':        'Please enter a valid email address.',
        'invalid-api-key':      'Invalid API key — check .env.local.',
      }
      setError(code ? (map[code] ?? `Auth error: ${code}`) : raw.replace('Firebase: ', ''))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreatePortfolio(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await api.post('/api/portfolios', {
        displayName: portfolioName.trim(),
        slug:        slug.trim(),
      })
      await refreshProfile()
      router.replace('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create portfolio')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <div className="min-h-screen flex items-center justify-center px-4 dot-grid">

      {/* Theme toggle — top right */}
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle className="w-8 h-8 text-[#374151] dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-gray-800 rounded-lg" />
      </div>

      <div className="w-full max-w-sm">

        {/* Logo + wordmark */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center gap-3 text-black dark:text-white mb-1 hover:opacity-80 transition-opacity">
            <LogoIcon size={36} variant="outline" />
            <span className="text-[28px] font-bold tracking-[-0.5px]">PMBoards</span>
          </Link>
          <p className="text-[13px] text-[#6B7280] dark:text-gray-400 mt-1">
            {step === 1 ? 'Create your admin account' : 'Set up your portfolio'}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                s < step  ? 'bg-[#22c55e] text-white' :
                s === step ? 'bg-black dark:bg-white text-white dark:text-black' :
                'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`}>
                {s < step ? '✓' : s}
              </div>
              <span className={`text-[12px] font-medium ${s === step ? 'text-black dark:text-white' : 'text-[#9CA3AF] dark:text-gray-500'}`}>
                {s === 1 ? 'Account' : 'Portfolio'}
              </span>
              {s < 2 && <span className="text-[#D1D5DB] dark:text-gray-600 text-[12px]">→</span>}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">

          {/* Step 1: Account */}
          {step === 1 && (
            <form onSubmit={handleCreateAccount} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Email *</label>
                <input
                  type="email" required className={inputCls}
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Password *</label>
                <input
                  type="password" required minLength={6} className={inputCls}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              {error && <p className="text-[12px] text-red-500 bg-red-50 dark:bg-red-950/40 dark:border dark:border-red-900/50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit" disabled={busy}
                className="w-full bg-black dark:bg-white text-white dark:text-black text-[13px] font-semibold py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Creating account…' : 'Continue →'}
              </button>
              <p className="text-center text-[12px] text-[#6B7280] dark:text-gray-400">
                Already have an account?{' '}
                <button type="button" onClick={() => router.push('/login')}
                  className="text-black dark:text-white font-semibold hover:underline">
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* Step 2: Portfolio */}
          {step === 2 && (
            <form onSubmit={handleCreatePortfolio} className="p-6 flex flex-col gap-4">
              <div className="bg-[#F9FAFB] dark:bg-gray-800 border border-[#E5E7EB] dark:border-gray-700 rounded-lg px-4 py-3 text-[12px] text-[#6B7280] dark:text-gray-400">
                🏢 This is your company's portfolio. Team members will use the portfolio name to log in.
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Portfolio / Company Name *</label>
                <input
                  type="text" required className={inputCls}
                  value={portfolioName}
                  onChange={e => handlePortfolioNameChange(e.target.value)}
                  placeholder="e.g. ACME Construction"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">
                  Portfolio ID <span className="text-[10px] text-[#9CA3AF] dark:text-gray-500 font-normal">(team login name)</span>
                </label>
                <input
                  type="text" required className={inputCls}
                  value={slug}
                  onChange={e => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugEdited(true) }}
                  placeholder="e.g. acme-construction"
                />
                <p className="text-[11px] text-[#9CA3AF] dark:text-gray-500 mt-1">
                  Lowercase letters, numbers, and hyphens only. Team members will type this to log in.
                </p>
              </div>
              {error && <p className="text-[12px] text-red-500 bg-red-50 dark:bg-red-950/40 dark:border dark:border-red-900/50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit" disabled={busy || !slug}
                className="w-full bg-[#2563FF] hover:bg-[#1d4fd8] text-white text-[13px] font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {busy ? 'Creating portfolio…' : 'Create Portfolio →'}
              </button>
              <button
                type="button" onClick={() => { setError(''); setStep(1) }}
                className="w-full text-[12px] font-semibold text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              >
                ← Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
