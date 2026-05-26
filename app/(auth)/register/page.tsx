'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { auth } from '@/lib/firebase'
import { api } from '@/lib/api'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors placeholder:text-gray-400'

function toSlug(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

export default function RegisterPage() {
  const { user, loading, signUp, refreshProfile } = useAuth()
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
    if (!loading && user) {
      // User already logged in — check if they need a portfolio
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  function handlePortfolioNameChange(val: string) {
    setPortfolioName(val)
    if (!slugEdited) setSlug(toSlug(val))
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await signUp(email, password)
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
      // Force-refresh token so new portfolio claims take effect
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#F9FAFB]">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-black tracking-[-0.5px]">PMBoards</div>
          <p className="text-[13px] text-[#6B7280] mt-1">
            {step === 1 ? 'Create your admin account' : 'Set up your portfolio'}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                s < step ? 'bg-[#22c55e] text-white' :
                s === step ? 'bg-black text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {s < step ? '✓' : s}
              </div>
              <span className={`text-[12px] font-medium ${s === step ? 'text-black' : 'text-[#9CA3AF]'}`}>
                {s === 1 ? 'Account' : 'Portfolio'}
              </span>
              {s < 2 && <span className="text-[#D1D5DB] text-[12px]">→</span>}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Step 1: Account */}
          {step === 1 && (
            <form onSubmit={handleCreateAccount} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Email *</label>
                <input
                  type="email" required className={inputCls}
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Password *</label>
                <input
                  type="password" required minLength={6} className={inputCls}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              {error && <p className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit" disabled={busy}
                className="w-full bg-black text-white text-[13px] font-semibold py-2.5 rounded-lg hover:bg-[#0F1115] disabled:opacity-50 transition-colors"
              >
                {busy ? 'Creating account…' : 'Continue →'}
              </button>
              <p className="text-center text-[12px] text-[#6B7280]">
                Already have an account?{' '}
                <button type="button" onClick={() => router.push('/login')}
                  className="text-black font-semibold hover:underline">
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* Step 2: Portfolio */}
          {step === 2 && (
            <form onSubmit={handleCreatePortfolio} className="p-6 flex flex-col gap-4">
              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-4 py-3 text-[12px] text-[#6B7280]">
                🏢 This is your company's portfolio. Team members will use the portfolio name to log in.
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">Portfolio / Company Name *</label>
                <input
                  type="text" required className={inputCls}
                  value={portfolioName}
                  onChange={e => handlePortfolioNameChange(e.target.value)}
                  placeholder="e.g. ACME Construction"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] mb-1.5">
                  Portfolio ID <span className="text-[10px] text-[#9CA3AF] font-normal">(team login name)</span>
                </label>
                <input
                  type="text" required className={inputCls}
                  value={slug}
                  onChange={e => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugEdited(true) }}
                  placeholder="e.g. acme-construction"
                />
                <p className="text-[11px] text-[#9CA3AF] mt-1">
                  Lowercase letters, numbers, and hyphens only. Team members will type this to log in.
                </p>
              </div>
              {error && <p className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit" disabled={busy || !slug}
                className="w-full bg-[#2563FF] hover:bg-[#1d4fd8] text-white text-[13px] font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {busy ? 'Creating portfolio…' : 'Create Portfolio →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
