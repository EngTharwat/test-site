'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { PROJECT_TYPES, CURRENCIES, PROJECT_TYPE_LABELS, ZONE_TYPES_BY_PROJECT, ProjectType } from '@/lib/types'

const inputCls  = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const selectCls = inputCls + ' cursor-pointer'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

interface BreakdownEntry { type: string; length: string }

export default function NewProjectPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [form, setForm] = useState({
    name: '', client: '', contractor: '', consultant: '', location: '',
    projectType: 'sewer_network' as ProjectType,
    contractValue: '', currency: 'SAR',
    contractStartDate: '', contractEndDate: '',
    description: '',
  })

  const [breakdown, setBreakdown] = useState<BreakdownEntry[]>([
    { type: '', length: '' },
  ])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const typeOptions = ZONE_TYPES_BY_PROJECT[form.projectType] ?? ZONE_TYPES_BY_PROJECT.other

  // Recompute total from current breakdown
  const totalNetworkLength = breakdown.reduce((s, r) => s + (Number(r.length) || 0), 0)

  function setBreakdownRow(idx: number, key: keyof BreakdownEntry, value: string) {
    setBreakdown(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r))
  }

  function addBreakdownRow() {
    setBreakdown(prev => [...prev, { type: '', length: '' }])
  }

  function removeBreakdownRow(idx: number) {
    setBreakdown(prev => prev.filter((_, i) => i !== idx))
  }

  // When project type changes, reset breakdown type selections that are no longer valid
  function handleProjectTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newType = e.target.value as ProjectType
    setForm(f => ({ ...f, projectType: newType }))
    setBreakdown(prev => prev.map(r => ({ ...r, type: '' })))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const entries = breakdown
        .filter(r => r.type && Number(r.length) > 0)
        .map(r => ({ type: r.type, length: Number(r.length) }))

      const project = await api.post('/api/projects', {
        ...form,
        contractValue: Number(form.contractValue) || 0,
        breakdownEntries: entries,
      })
      router.push(`/projects/${project.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <button onClick={() => router.back()}
          className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-4 flex items-center gap-1.5 transition-colors">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-black dark:text-white tracking-[-0.5px]">New Project</h1>
        <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">Fill in the project details to get started</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Project Information */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-5">Project Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <Field label="Project Name" required>
                <input className={inputCls} value={form.name} onChange={set('name')}
                  placeholder="e.g. NWC Wastewater Infrastructure — Zone A" required />
              </Field>
            </div>
            <Field label="Client">
              <input className={inputCls} value={form.client} onChange={set('client')} placeholder="e.g. National Water Company" />
            </Field>
            <Field label="Contractor">
              <input className={inputCls} value={form.contractor} onChange={set('contractor')} placeholder="e.g. Al-Rashid Construction" />
            </Field>
            <Field label="Consultant">
              <input className={inputCls} value={form.consultant} onChange={set('consultant')} placeholder="e.g. Dar Al-Handasah" />
            </Field>
            <Field label="Location">
              <input className={inputCls} value={form.location} onChange={set('location')} placeholder="e.g. Al-Ahsa, Eastern Province" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Project Type">
                <select className={selectCls} value={form.projectType} onChange={handleProjectTypeChange}>
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Description">
                <textarea className={inputCls + ' resize-none'} rows={3} value={form.description} onChange={set('description')}
                  placeholder="Brief project description, scope, or notes..." />
              </Field>
            </div>
          </div>
        </div>

        {/* Contract & Financial */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-5">Contract & Financial</h2>
          <div className="grid grid-cols-2 gap-5">
            <Field label="Contract Value" required>
              <input className={inputCls} type="number" min="0" step="any"
                value={form.contractValue} onChange={set('contractValue')} placeholder="e.g. 84,000,000" required />
            </Field>
            <Field label="Currency">
              <select className={selectCls} value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Contract Start Date">
              <input className={inputCls} type="date" value={form.contractStartDate} onChange={set('contractStartDate')} />
            </Field>
            <Field label="Contract End Date">
              <input className={inputCls} type="date" value={form.contractEndDate} onChange={set('contractEndDate')} />
            </Field>
          </div>
        </div>

        {/* Project Length Breakdown */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider">Project Length Breakdown</h2>
            {totalNetworkLength > 0 && (
              <span className="text-[12px] font-semibold text-[#2563FF]">
                Total: {totalNetworkLength.toLocaleString()} m
              </span>
            )}
          </div>
          <p className="text-[12px] text-[#6B7280] dark:text-gray-400 mb-5">
            Enter lengths per network type. The total will be stored as "Project Overall Length".
          </p>

          <div className="space-y-3">
            {breakdown.map((row, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <select
                  className={selectCls + ' flex-1'}
                  value={row.type}
                  onChange={e => setBreakdownRow(idx, 'type', e.target.value)}
                >
                  <option value="">— Select Type —</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex items-center gap-2 w-48">
                  <input
                    className={inputCls}
                    type="number" min="0" step="1"
                    placeholder="Length (m)"
                    value={row.length}
                    onChange={e => setBreakdownRow(idx, 'length', e.target.value)}
                  />
                </div>
                <button type="button" onClick={() => removeBreakdownRow(idx)}
                  disabled={breakdown.length === 1}
                  className="text-[#9CA3AF] hover:text-red-500 transition-colors disabled:opacity-30 flex-shrink-0 text-lg leading-none"
                  title="Remove row">
                  ×
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addBreakdownRow}
            className="mt-4 text-[12px] font-semibold text-[#2563FF] hover:text-[#1d4fd8] transition-colors flex items-center gap-1">
            + Add Row
          </button>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-4 py-3 rounded-lg">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : 'Create Project'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
            Cancel
          </button>
        </div>

      </form>
    </div>
  )
}
