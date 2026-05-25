'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (tab === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
      router.replace('/dashboard')
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err)
      const code = raw.match(/\(auth\/([^)]+)\)/)?.[1]
      const friendly: Record<string, string> = {
        'invalid-api-key': 'Invalid API key — check your .env.local NEXT_PUBLIC_FIREBASE_API_KEY value.',
        'email-already-in-use': 'That email already has an account. Try logging in instead.',
        'weak-password': 'Password must be at least 6 characters.',
        'invalid-email': 'Please enter a valid email address.',
        'user-not-found': 'No account found with that email.',
        'wrong-password': 'Incorrect password.',
        'invalid-credential': 'Email or password is incorrect.',
        'network-request-failed': 'Network error. Check your internet connection.',
        'configuration-not-found': 'Firebase project not configured — check your .env.local values.',
      }
      setError(code ? (friendly[code] ?? `Auth error: ${code}`) : raw.replace('Firebase: ', ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-8">PMBoards</h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === 'login'
                  ? 'bg-white text-black border-b-2 border-black'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => { setTab('login'); setError('') }}
            >
              Log in
            </button>
            <button
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === 'register'
                  ? 'bg-white text-black border-b-2 border-black'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => { setTab('register'); setError('') }}
            >
              Create account
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-black text-white rounded-lg py-2 text-sm font-semibold hover:bg-[#0F1115] disabled:opacity-50 transition-colors"
            >
              {busy ? 'Please wait…' : tab === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
