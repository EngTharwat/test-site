'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type Role } from '@/lib/roles'

const inputCls  = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const selectCls = inputCls + ' cursor-pointer'

const ROLE_COLORS: Record<Role, string> = {
  admin:           'bg-purple-100 text-purple-700',
  project_manager: 'bg-blue-100  text-blue-700',
  site_engineer:   'bg-orange-100 text-orange-700',
  surveyor:        'bg-green-100  text-green-700',
}

interface Member {
  id:          string
  username:    string
  displayName: string
  role:        Role
}

export default function MembersPage() {
  const { profile } = useAuth()
  const router      = useRouter()

  const [members,  setMembers]  = useState<Member[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)

  const [form, setForm] = useState({ username: '', displayName: '', role: 'site_engineer' as Role })

  const portfolioId = profile?.portfolioId

  const fetchMembers = useCallback(async () => {
    if (!portfolioId) return
    try {
      const data = await api.get(`/api/portfolios/${portfolioId}/members`)
      setMembers(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [portfolioId])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!portfolioId) return
    setSaving(true); setError('')
    try {
      const member = await api.post(`/api/portfolios/${portfolioId}/members`, form)
      setMembers(prev => [...prev, member])
      setForm({ username: '', displayName: '', role: 'site_engineer' })
      setShowForm(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setSaving(false)
    }
  }

  async function handleRoleChange(member: Member, newRole: Role) {
    if (!portfolioId) return
    try {
      const updated = await api.patch(
        `/api/portfolios/${portfolioId}/members/${member.username}`,
        { role: newRole }
      )
      setMembers(prev => prev.map(m => m.username === member.username ? { ...m, role: updated.role } : m))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  async function handleDelete(member: Member) {
    if (!portfolioId) return
    if (!confirm(`Remove "${member.displayName}" from the portfolio?\nThey will lose access immediately.`)) return
    try {
      await api.delete(`/api/portfolios/${portfolioId}/members/${member.username}`)
      setMembers(prev => prev.filter(m => m.username !== member.username))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-[#6B7280] dark:text-gray-400">Only admins can manage team members.</p>
      </div>
    )
  }

  if (profile.needsPortfolio) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <div className="text-4xl mb-4">🏢</div>
        <h2 className="text-xl font-bold text-black dark:text-white mb-2">Set up your portfolio first</h2>
        <p className="text-[13px] text-[#6B7280] dark:text-gray-400 mb-6">
          You need to create your company portfolio before you can add team members.
        </p>
        <button
          onClick={() => router.push('/register')}
          className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors"
        >
          Create Portfolio →
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push('/dashboard')}
            className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-1 flex items-center gap-1 transition-colors">
            ← Portfolio
          </button>
          <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">Team Members</h1>
          <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">
            Portfolio: <strong className="text-black dark:text-white">{profile.portfolioName}</strong>
            <span className="ml-2 text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded font-mono">{profile.portfolioSlug}</span>
          </p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError('') }}
          className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors"
        >
          + Add Member
        </button>
      </div>

      {/* Portfolio login hint */}
      <div className="bg-[#F9FAFB] dark:bg-gray-800 border border-[#E5E7EB] dark:border-gray-700 rounded-xl p-4 mb-6 text-[12px] text-[#374151] dark:text-gray-300">
        <strong>Team login info:</strong> Members go to the login page and enter portfolio name{' '}
        <span className="font-mono bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-1.5 py-0.5 rounded">{profile.portfolioSlug}</span>
        {' '}and their username to sign in. No password needed.
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">New Team Member</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Username *</label>
              <input
                className={inputCls} required
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                placeholder="e.g. john_doe"
              />
              <p className="text-[10px] text-[#9CA3AF] dark:text-gray-500 mt-0.5">Lowercase, no spaces</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Display Name *</label>
              <input
                className={inputCls} required
                value={form.displayName}
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                placeholder="e.g. John Doe"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">Role *</label>
              <select
                className={selectCls}
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
              >
                {ROLES.filter(r => r !== 'admin').map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-[#6B7280] dark:text-gray-400 mt-3 bg-[#F9FAFB] dark:bg-gray-800 border border-[#E5E7EB] dark:border-gray-700 rounded-lg px-3 py-2">
            🔑 {ROLE_DESCRIPTIONS[form.role]}
          </p>
          {error && <p className="text-[12px] text-red-500 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving}
              className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Adding…' : 'Add Member'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="text-[12px] text-red-500 mb-4">{error}</p>}

      {/* Members list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="grid grid-cols-[1fr_160px_160px_80px] gap-4 px-6 py-3 bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">
            <span>Member</span>
            <span>Username</span>
            <span>Role</span>
            <span></span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {members.map(m => (
              <div key={m.username} className="grid grid-cols-[1fr_160px_160px_80px] gap-4 items-center px-6 py-4">
                <div>
                  <div className="text-[13px] font-semibold text-black dark:text-white">{m.displayName}</div>
                  {m.username === 'admin' && (
                    <div className="text-[10px] text-[#9CA3AF] dark:text-gray-500">Portfolio admin</div>
                  )}
                </div>
                <span className="font-mono text-[12px] text-[#374151] dark:text-gray-300">{m.username}</span>
                <div>
                  {m.username === 'admin' ? (
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${ROLE_COLORS['admin']}`}>
                      {ROLE_LABELS['admin']}
                    </span>
                  ) : (
                    <select
                      className="text-[11px] font-semibold border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-black/10 dark:focus:ring-white/5 cursor-pointer"
                      value={m.role}
                      onChange={e => handleRoleChange(m, e.target.value as Role)}
                    >
                      {ROLES.filter(r => r !== 'admin').map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex justify-end">
                  {m.username !== 'admin' && (
                    <button
                      onClick={() => handleDelete(m)}
                      className="text-[11px] text-red-400 hover:text-red-600 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="px-6 py-8 text-center text-[13px] text-[#6B7280] dark:text-gray-400">
                No team members yet. Add your first member above.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Role reference */}
      <div className="mt-8 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-4">Role Permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ROLES.map(r => (
            <div key={r} className="flex items-start gap-3 p-3 rounded-lg bg-[#F9FAFB] dark:bg-gray-800 border border-[#F3F4F6] dark:border-gray-700">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap mt-0.5 ${ROLE_COLORS[r]}`}>
                {ROLE_LABELS[r]}
              </span>
              <p className="text-[11px] text-[#6B7280] dark:text-gray-400 leading-relaxed">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
