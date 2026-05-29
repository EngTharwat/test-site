'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ThemeToggle } from '@/lib/theme-toggle'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

function LoginPageInner() {
  const { user, loading, signIn, signInMember } = useAuth()
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [tab,      setTab]      = useState<'admin' | 'member'>(
    searchParams.get('tab') === 'member' ? 'member' : 'admin'
  )
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [slug,     setSlug]     = useState('')
  const [username, setUsername] = useState('')
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  // Pre-fill member login fields from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pmboards-member-login')
      if (saved) {
        const { slug: s, username: u } = JSON.parse(saved)
        if (s) setSlug(s)
        if (u) setUsername(u)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await signIn(email, password)
      router.replace('/dashboard')
    } catch (err: unknown) {
      const raw  = err instanceof Error ? err.message : String(err)
      const code = raw.match(/\(auth\/([^)]+)\)/)?.[1]
      const map: Record<string, string> = {
        'invalid-credential':    'Email or password is incorrect.',
        'user-not-found':        'No account found with that email.',
        'wrong-password':        'Incorrect password.',
        'too-many-requests':     'Too many attempts. Try again later.',
        'invalid-api-key':       'Invalid API key — check .env.local.',
        'network-request-failed':'Network error. Check your connection.',
      }
      setError(code ? (map[code] ?? `Auth error: ${code}`) : raw.replace('Firebase: ', ''))
    } finally {
      setBusy(false)
    }
  }

  async function handleMemberLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await signInMember(slug.trim().toLowerCase(), username.trim().toLowerCase())
      router.replace('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
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

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">PMBoards</div>
          <p className="text-[13px] text-[#6B7280] dark:text-gray-400 mt-1">Sign in to your workspace</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            <button
              className={`flex-1 py-3 text-[13px] font-semibold transition-colors ${
                tab === 'admin'
                  ? 'text-black dark:text-white border-b-2 border-black dark:border-white bg-white dark:bg-gray-900'
                  : 'text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
              onClick={() => { setTab('admin'); setError('') }}
            >
              Admin Login
            </button>
            <button
              className={`flex-1 py-3 text-[13px] font-semibold transition-colors ${
                tab === 'member'
                  ? 'text-black dark:text-white border-b-2 border-black dark:border-white bg-white dark:bg-gray-900'
                  : 'text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
              onClick={() => { setTab('member'); setError('') }}
            >
              Team Login
            </button>
          </div>

          {/* Admin form */}
          {tab === 'admin' && (
            <form onSubmit={handleAdminLogin} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Email</label>
                <input
                  type="email" required className={inputCls}
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Password</label>
                <input
                  type="password" required className={inputCls}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              {error && <p className="text-[12px] text-red-500 bg-red-50 dark:bg-red-950/40 dark:border dark:border-red-900/50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit" disabled={busy}
                className="w-full bg-black dark:bg-white text-white dark:text-black text-[13px] font-semibold py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
              <p className="text-center text-[12px] text-[#6B7280] dark:text-gray-400">
                No account?{' '}
                <button type="button" onClick={() => router.push('/register')}
                  className="text-black dark:text-white font-semibold hover:underline">
                  Create portfolio →
                </button>
              </p>
            </form>
          )}

          {/* Member form */}
          {tab === 'member' && (
            <form onSubmit={handleMemberLogin} className="p-6 flex flex-col gap-4">
              <div className="bg-[#F9FAFB] dark:bg-gray-800 border border-[#E5E7EB] dark:border-gray-700 rounded-lg px-4 py-3 text-[12px] text-[#6B7280] dark:text-gray-400">
                💡 Enter the portfolio name your admin shared with you, and your username.
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Portfolio Name</label>
                <input
                  type="text" required className={inputCls}
                  value={slug} onChange={e => { const v = e.target.value; setSlug(v); localStorage.setItem('pmboards-member-login', JSON.stringify({ slug: v, username })) }}
                  placeholder="e.g. acme-construction"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Username</label>
                <input
                  type="text" required className={inputCls}
                  value={username} onChange={e => { const v = e.target.value; setUsername(v); localStorage.setItem('pmboards-member-login', JSON.stringify({ slug, username: v })) }}
                  placeholder="e.g. john"
                />
              </div>
              {error && <p className="text-[12px] text-red-500 bg-red-50 dark:bg-red-950/40 dark:border dark:border-red-900/50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit" disabled={busy}
                className="w-full bg-black dark:bg-white text-white dark:text-black text-[13px] font-semibold py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Signing in…' : 'Join Workspace →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  )
}
