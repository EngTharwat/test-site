'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import {
  PROJECT_TYPES, PROJECT_STATUSES, CURRENCIES,
  PROJECT_TYPE_LABELS, STATUS_LABELS,
} from '@/lib/types'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#374151] dark:text-gray-300 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls  = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/5 focus:border-black dark:focus:border-gray-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500'
const selectCls = inputCls + ' cursor-pointer'

export default function NewProjectPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [form, setForm] = useState({
    name:               '',
    client:             '',
    contractor:         '',
    consultant:         '',
    location:           '',
    projectType:        'sewer_network',
    contractValue:      '',
    currency:           'SAR',
    totalNetworkLength: '',
    lengthUnit:         'm',
    contractStartDate:  '',
    contractEndDate:    '',
    status:             'planning',
    description:        '',
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const project = await api.post('/api/projects', {
        ...form,
        contractValue:      Number(form.contractValue) || 0,
        totalNetworkLength: (Number(form.totalNetworkLength) || 0) * (form.lengthUnit === 'km' ? 1000 : 1),
      })
      router.push(`/projects/${project.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="text-[12px] text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white mb-4 flex items-center gap-1.5 transition-colors"
        >
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
                <input className={inputCls} value={form.name} onChange={set('name')} placeholder="e.g. NWC Wastewater Infrastructure — Zone A" required />
              </Field>
            </div>

            <Field label="Client">
              <input className={inputCls} value={form.client} onChange={set('client')} placeholder="e.g. National Water Company" />
            </Field>

            <Field label="Contractor">
              <input className={inputCls} value={form.contractor} onChange={set('contractor')} placeholder="e.g. Al-Rashid Construction Co." />
            </Field>

            <Field label="Consultant / Supervision">
              <input className={inputCls} value={form.consultant} onChange={set('consultant')} placeholder="e.g. Dar Al-Handasah" />
            </Field>

            <Field label="Location">
              <input className={inputCls} value={form.location} onChange={set('location')} placeholder="e.g. Riyadh, Zone 7" />
            </Field>

            <Field label="Project Type">
              <select className={selectCls} value={form.projectType} onChange={set('projectType')}>
                {PROJECT_TYPES.map(t => (
                  <option key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select className={selectCls} value={form.status} onChange={set('status')}>
                {PROJECT_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </Field>

            <div className="md:col-span-2">
              <Field label="Description">
                <textarea
                  className={inputCls + ' resize-none'}
                  rows={3}
                  value={form.description}
                  onChange={set('description')}
                  placeholder="Brief project description, scope, or notes..."
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Contract & Financial */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-[13px] font-bold text-black dark:text-white uppercase tracking-wider mb-5">Contract & Financial</h2>
          <div className="grid grid-cols-2 gap-5">

            <Field label="Contract Value" required>
              <input
                className={inputCls}
                type="number" min="0" step="any"
                value={form.contractValue} onChange={set('contractValue')}
                placeholder="e.g. 84,000,000" required
              />
            </Field>

            <Field label="Currency">
              <select className={selectCls} value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <Field label="Total Network Length">
              <input
                className={inputCls}
                type="number" min="0" step="1"
                value={form.totalNetworkLength} onChange={set('totalNetworkLength')}
                placeholder="e.g. 15,000"
              />
            </Field>

            <Field label="Unit">
              <select className={selectCls} value={form.lengthUnit} onChange={set('lengthUnit')}>
                <option value="m">Metres (m)</option>
                <option value="km">Kilometres (km)</option>
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

        {/* Error */}
        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-4 py-3 rounded-lg">{error}</p>}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit" disabled={saving}
            className="bg-black dark:bg-white text-white dark:text-black text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating…' : 'Create Project'}
          </button>
          <button
            type="button" onClick={() => router.back()}
            className="text-sm text-[#6B7280] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>

      </form>
    </div>
  )
}
