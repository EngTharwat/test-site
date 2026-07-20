'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { auth } from './firebase'
import { api } from './api'
import type { MemberPermissions } from './permissions'

// ── Profile ───────────────────────────────────────────────────────────────────
export interface UserProfile {
  /** True for email/password portfolio owners. */
  isAdmin:        boolean
  /** 'admin' | 'member' — kept for display purposes (role badge). */
  role:           'admin' | 'member' | null
  /** Granular permissions for non-admin members. Null for admins. */
  permissions:    MemberPermissions | null
  portfolioId:    string | null
  portfolioSlug:  string | null
  portfolioName:  string | null
  username:       string | null
  /** Admin is logged in but hasn't created a portfolio yet. */
  needsPortfolio: boolean
}

// ── Context shape ─────────────────────────────────────────────────────────────
interface AuthContextValue {
  user:           User | null
  loading:        boolean
  profile:        UserProfile | null
  profileLoading: boolean
  /** True when /api/me failed with a server/network error (e.g. the backend
   *  couldn't reach Firestore). We deliberately do NOT downgrade the user to a
   *  member in this case — the UI shows a retry state instead. */
  profileError:   boolean
  getToken:       () => Promise<string | null>
  signIn:         (email: string, password: string) => Promise<void>
  signUp:         (email: string, password: string) => Promise<void>
  signInMember:   (portfolioSlug: string, username: string) => Promise<void>
  refreshProfile: () => Promise<void>
  signOut:        () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,           setUser]           = useState<User | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [profile,        setProfile]        = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError,   setProfileError]   = useState(false)

  // Fetch /api/me to get portfolio + permissions info
  const fetchProfile = useCallback(async (u: User) => {
    setProfileLoading(true)
    try {
      const token = await u.getIdToken()
      const res   = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setProfile(await res.json())
        setProfileError(false)
      } else if (res.status >= 500) {
        // The backend couldn't load the account (e.g. Firestore quota/outage).
        // Don't pretend the user is a member — surface a retryable error so we
        // never mistake a transient outage for a lost admin / lost data.
        setProfile(null)
        setProfileError(true)
      } else {
        // 4xx — a genuine auth/permission state, not an outage.
        setProfile({
          isAdmin: false, role: null, permissions: null,
          portfolioId: null, portfolioSlug: null, portfolioName: null,
          username: null, needsPortfolio: false,
        })
        setProfileError(false)
      }
    } catch {
      // Network failure — also transient, retryable.
      setProfile(null)
      setProfileError(true)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  // Start every app load with a clean data cache so users never see stale
  // data after a refresh (and one account's cache can't outlive it).
  useEffect(() => { api.clearCache() }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      if (u) fetchProfile(u)
      else { setProfile(null); setProfileError(false) }
    })
    return unsub
  }, [fetchProfile])

  const getToken = async () => {
    if (!user) return null
    return user.getIdToken()
  }

  const signIn = async (email: string, password: string) => {
    api.clearCache()
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await fetchProfile(cred.user)
  }

  const signUp = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password)
  }

  const signInMember = async (portfolioSlug: string, username: string) => {
    const res = await fetch('/api/auth/member-login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ portfolioSlug, username }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Login failed')
    }
    const { token } = await res.json()
    api.clearCache()
    const cred = await signInWithCustomToken(auth, token)
    await fetchProfile(cred.user)
  }

  const refreshProfile = async () => {
    if (!user) return
    await user.getIdToken(true)
    await fetchProfile(user)
  }

  const signOut = async () => {
    api.clearCache()
    await firebaseSignOut(auth)
    setProfile(null)
    setProfileError(false)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, profile, profileLoading, profileError,
      getToken, signIn, signUp, signInMember, refreshProfile, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
