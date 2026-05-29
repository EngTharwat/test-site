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
      } else {
        setProfile({
          isAdmin: false, role: null, permissions: null,
          portfolioId: null, portfolioSlug: null, portfolioName: null,
          username: null, needsPortfolio: false,
        })
      }
    } catch {
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      if (u) fetchProfile(u)
      else   setProfile(null)
    })
    return unsub
  }, [fetchProfile])

  const getToken = async () => {
    if (!user) return null
    return user.getIdToken()
  }

  const signIn = async (email: string, password: string) => {
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
    const cred = await signInWithCustomToken(auth, token)
    await fetchProfile(cred.user)
  }

  const refreshProfile = async () => {
    if (!user) return
    await user.getIdToken(true)
    await fetchProfile(user)
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, profile, profileLoading,
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
