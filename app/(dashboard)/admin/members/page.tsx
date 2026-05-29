'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import {
  type MemberPermissions, type PagePermissions,
  DEFAULT_PAGE_PERMISSIONS, PAGE_LABELS, ALL_PAGES, EDITABLE_PAGES,
  permissionsSummary, getProjectPagePermissions,
} from '@/lib/permissions'

const inputCls = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultMemberPermissions(): MemberPermissions {
  return {
    project_scope:    'all',
    project_ids:      null,
    page_permissions: { ...DEFAULT_PAGE_PERMISSIONS },
  }
}

interface ProjectOption { id: string; name: string }

// ── PagePermGrid ──────────────────────────────────────────────────────────────
function PagePermGrid({
  perms, onChange, label,
}: {
  perms: PagePermissions
  onChange: (p: PagePermissions) => void
  label?: string
}) {
  const chipBase = 'px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer select-none'
  const active   = 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
  const inactive = 'bg-white dark:bg-gray-800 text-[#6B7280] dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'

  function set(page: keyof PagePermissions, val: string) {
    onChange({ ...perms, [page]: val })
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {label && (
        <div className="px-3 py-2 bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-[#374151] dark:text-gray-300 uppercase tracking-wider">
          {label}
        </div>
      )}
      <table className="w-full">
        <thead>
          <tr className="bg-[#F9FAFB] dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
            <th className="text-left px-3 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Page</th>
            <th className="px-2 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider text-center w-16">None</th>
            <th className="px-2 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider text-center w-16">View</th>
            <th className="px-2 py-2 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider text-center w-16">Edit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {ALL_PAGES.map(page => {
            const cur     = perms[page]
            const hasEdit = EDITABLE_PAGES.includes(page as any)
            return (
              <tr key={page} className="hover:bg-[#F9FAFB] dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-3 py-2 text-[12px] font-medium text-black dark:text-white">
                  {PAGE_LABELS[page]}
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => set(page, 'none')}
                    className={`${chipBase} ${cur === 'none' ? active : inactive}`}
                  >
                    None
                  </button>
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => set(page, 'view')}
                    className={`${chipBase} ${cur === 'view' ? active : inactive}`}
                  >
                    View
                  </button>
                </td>
                <td className="px-2 py-2 text-center">
                  {hasEdit ? (
                    <button
                      type="button"
                      onClick={() => set(page, 'edit')}
                      className={`${chipBase} ${cur === 'edit' ? active : inactive}`}
                    >
                      Edit
                    </button>
                  ) : (
                    <span className="text-[11px] text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── PermissionsEditor ─────────────────────────────────────────────────────────
function PermissionsEditor({
  value, onChange, projects,
}: {
  value:    MemberPermissions
  onChange: (v: MemberPermissions) => void
  projects: ProjectOption[]
}) {
  const [sameForAll, setSameForAll] = useState(true)

  // Derive a "shared" flat perms from value (used when scope=all OR sameForAll)
  const sharedPerms: PagePermissions =
    value.project_scope === 'all'
      ? (value.page_permissions as PagePermissions)
      : (value.project_ids?.length
          ? ((value.page_permissions as Record<string, PagePermissions>)[value.project_ids[0]] ?? { ...DEFAULT_PAGE_PERMISSIONS })
          : { ...DEFAULT_PAGE_PERMISSIONS })

  function setScope(scope: 'all' | 'specific') {
    if (scope === 'all') {
      onChange({
        project_scope:    'all',
        project_ids:      null,
        page_permissions: { ...sharedPerms },
      })
    } else {
      const ids = value.project_ids ?? []
      const byId: Record<string, PagePermissions> = {}
      ids.forEach(id => { byId[id] = { ...sharedPerms } })
      onChange({ project_scope: 'specific', project_ids: ids, page_permissions: byId })
    }
  }

  function toggleProjectId(id: string) {
    const current = value.project_ids ?? []
    const next    = current.includes(id) ? current.filter(x => x !== id) : [...current, id]

    const byId: Record<string, PagePermissions> = {}
    next.forEach(pid => {
      byId[pid] = (value.page_permissions as Record<string, PagePermissions>)[pid]
        ?? { ...sharedPerms }
    })
    onChange({ ...value, project_ids: next, page_permissions: byId })
  }

  function setSharedPerms(p: PagePermissions) {
    if (value.project_scope === 'all') {
      onChange({ ...value, page_permissions: p })
    } else {
      // sameForAll — push same perms to all selected project IDs
      const byId: Record<string, PagePermissions> = {}
      ;(value.project_ids ?? []).forEach(id => { byId[id] = { ...p } })
      onChange({ ...value, page_permissions: byId })
    }
  }

  function setPerProjectPerms(projectId: string, p: PagePermissions) {
    const prev = value.page_permissions as Record<string, PagePermissions>
    onChange({ ...value, page_permissions: { ...prev, [projectId]: p } })
  }

  const selectedIds = value.project_ids ?? []
  const showSameToggle = value.project_scope === 'specific' && selectedIds.length > 1

  return (
    <div className="space-y-4">
      {/* Scope selector */}
      <div>
        <div className="text-[11px] font-bold text-[#374151] dark:text-gray-300 uppercase tracking-wider mb-2">
          Project Scope
        </div>
        <div className="flex gap-4">
          {(['all', 'specific'] as const).map(s => (
            <label key={s} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                checked={value.project_scope === s}
                onChange={() => setScope(s)}
                className="accent-black dark:accent-white"
              />
              <span className="text-[13px] text-black dark:text-white font-medium">
                {s === 'all' ? 'All Projects' : 'Specific Projects'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Project checklist (specific scope only) */}
      {value.project_scope === 'specific' && (
        <div>
          <div className="text-[11px] font-bold text-[#374151] dark:text-gray-300 uppercase tracking-wider mb-2">
            Allowed Projects
          </div>
          {projects.length === 0 ? (
            <p className="text-[12px] text-[#6B7280] dark:text-gray-400 italic">
              No projects in portfolio yet
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
              {projects.map(p => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#F9FAFB] dark:hover:bg-gray-800/50 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggleProjectId(p.id)}
                    className="accent-black dark:accent-white"
                  />
                  <span className="text-[13px] text-black dark:text-white">{p.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Same-for-all toggle (specific + >1 project) */}
      {showSameToggle && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sameForAll}
            onChange={e => {
              setSameForAll(e.target.checked)
              if (e.target.checked) {
                // Flatten: copy first project's perms to all
                const first = (value.page_permissions as Record<string, PagePermissions>)[selectedIds[0]]
                  ?? { ...DEFAULT_PAGE_PERMISSIONS }
                const byId: Record<string, PagePermissions> = {}
                selectedIds.forEach(id => { byId[id] = { ...first } })
                onChange({ ...value, page_permissions: byId })
              }
            }}
            className="accent-black dark:accent-white"
          />
          <span className="text-[12px] text-black dark:text-white">
            Same permissions for all selected projects
          </span>
        </label>
      )}

      {/* Page permissions grid(s) */}
      {(value.project_scope === 'all' || selectedIds.length > 0) && (
        <div>
          <div className="text-[11px] font-bold text-[#374151] dark:text-gray-300 uppercase tracking-wider mb-2">
            Page Permissions
          </div>

          {value.project_scope === 'all' || sameForAll || selectedIds.length <= 1 ? (
            <PagePermGrid
              perms={sharedPerms}
              onChange={setSharedPerms}
            />
          ) : (
            <div className="space-y-3">
              {selectedIds.map(pid => {
                const proj  = projects.find(p => p.id === pid)
                const perms = (value.page_permissions as Record<string, PagePermissions>)[pid]
                  ?? { ...DEFAULT_PAGE_PERMISSIONS }
                return (
                  <PagePermGrid
                    key={pid}
                    label={proj?.name ?? pid}
                    perms={perms}
                    onChange={p => setPerProjectPerms(pid, p)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Member interface ───────────────────────────────────────────────────────────
interface Member {
  id:          string
  username:    string
  displayName: string
  permissions: MemberPermissions | null
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MembersPage() {
  const { profile } = useAuth()
  const router      = useRouter()

  const [members,  setMembers]  = useState<Member[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)

  // Form for adding a new member
  const [form, setForm]       = useState({ username: '', displayName: '' })
  const [formPerms, setFormPerms] = useState<MemberPermissions>(defaultMemberPermissions())

  // Edit permissions modal
  const [editPermsMember, setEditPermsMember] = useState<Member | null>(null)
  const [editPerms,       setEditPerms]       = useState<MemberPermissions>(defaultMemberPermissions())
  const [editSaving,      setEditSaving]      = useState(false)

  const portfolioId = profile?.portfolioId

  const fetchAll = useCallback(async () => {
    if (!portfolioId) return
    try {
      const [membersData, projectsData] = await Promise.all([
        api.get(`/api/portfolios/${portfolioId}/members`),
        api.get('/api/projects'),
      ])
      setMembers(membersData)
      setProjects((projectsData as any[]).map(p => ({ id: p.id, name: p.name })))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [portfolioId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!portfolioId) return
    setSaving(true); setError('')
    try {
      const member = await api.post(`/api/portfolios/${portfolioId}/members`, {
        username:    form.username,
        displayName: form.displayName,
        permissions: formPerms,
      })
      setMembers(prev => [...prev, member])
      setForm({ username: '', displayName: '' })
      setFormPerms(defaultMemberPermissions())
      setShowForm(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setSaving(false)
    }
  }

  function openEditPerms(member: Member) {
    setEditPermsMember(member)
    setEditPerms(member.permissions ?? defaultMemberPermissions())
  }

  async function handleSavePerms() {
    if (!portfolioId || !editPermsMember) return
    setEditSaving(true)
    try {
      const updated = await api.patch(
        `/api/portfolios/${portfolioId}/members/${editPermsMember.username}`,
        { permissions: editPerms }
      )
      setMembers(prev => prev.map(m =>
        m.username === editPermsMember.username ? { ...m, permissions: updated.permissions } : m
      ))
      setEditPermsMember(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update permissions')
    } finally {
      setEditSaving(false)
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
        <form onSubmit={handleAdd} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6 space-y-5">
          <h3 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">New Team Member</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-[#374151] dark:text-gray-300 uppercase tracking-wider">Permissions</span>
              <span className="text-[10px] text-[#6B7280] dark:text-gray-400 italic">Admin always has full access to everything</span>
            </div>
            <PermissionsEditor
              value={formPerms}
              onChange={setFormPerms}
              projects={projects}
            />
          </div>

          {error && <p className="text-[12px] text-red-500">{error}</p>}
          <div className="flex gap-3">
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
          <div className="grid grid-cols-[1fr_140px_1fr_160px] gap-4 px-6 py-3 bg-[#F3F4F6] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">
            <span>Member</span>
            <span>Username</span>
            <span>Permissions</span>
            <span></span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {members.map(m => (
              <div key={m.username} className="grid grid-cols-[1fr_140px_1fr_160px] gap-4 items-center px-6 py-4">
                <div>
                  <div className="text-[13px] font-semibold text-black dark:text-white">{m.displayName}</div>
                  {m.username === 'admin' && (
                    <div className="text-[10px] text-[#9CA3AF] dark:text-gray-500">Portfolio admin</div>
                  )}
                </div>
                <span className="font-mono text-[12px] text-[#374151] dark:text-gray-300">{m.username}</span>
                <div>
                  {m.username === 'admin' ? (
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                      Full access
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#6B7280] dark:text-gray-400 truncate block">
                      {m.permissions ? permissionsSummary(m.permissions) : 'No permissions set'}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3">
                  {m.username !== 'admin' && (
                    <>
                      <button
                        onClick={() => openEditPerms(m)}
                        className="text-[11px] font-medium text-[#374151] dark:text-gray-300 hover:text-black dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1.5 rounded-md transition-colors"
                      >
                        Edit Perms
                      </button>
                      <button
                        onClick={() => handleDelete(m)}
                        className="text-[11px] text-red-400 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    </>
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

      {/* Edit Permissions Modal */}
      {editPermsMember && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-10 px-4 overflow-y-auto"
          onClick={() => setEditPermsMember(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-xl mb-10"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-bold text-black dark:text-white tracking-[-0.3px]">
                  Edit Permissions
                </h2>
                <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-0.5">
                  {editPermsMember.displayName} · @{editPermsMember.username}
                </p>
              </div>
              <button
                onClick={() => setEditPermsMember(null)}
                className="text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="text-[10px] text-[#6B7280] dark:text-gray-400 italic">
                Admin always has full access to everything
              </div>
              <PermissionsEditor
                value={editPerms}
                onChange={setEditPerms}
                projects={projects}
              />
              {error && <p className="text-[12px] text-red-500">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={handleSavePerms}
                  className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  {editSaving ? 'Saving…' : 'Save Permissions'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditPermsMember(null)}
                  className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
