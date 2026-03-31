'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

export type Certification = {
  id: string
  first_name: string
  last_name: string
  email: string
  company: string | null
  cohort: string | null
  program: string | null
  certificate_number: string | null
  token: string | null
  issued_at: string | null
  email_sent_at: string | null
  email_status: string | null
  created_at: string
}

interface CertificationsTableProps {
  certifications: Certification[]
}

const CERTIFICATE_BASE_URL = 'https://kithclimate.com/verify'

const emailStatusColors: Record<string, string> = {
  pending: 'bg-[rgba(217,119,6,0.15)] text-[#D97706] border-[rgba(217,119,6,0.4)]',
  sent: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border-[rgba(91,154,139,0.4)]',
  failed: 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border-[rgba(239,68,68,0.4)]',
}

const COHORT_OPTIONS = [
  { value: 'January 19th 2026', label: 'January 19th 2026' },
  { value: 'March 16th 2026', label: 'March 16th 2026' },
  { value: 'May 18th 2026', label: 'May 18th 2026' },
]

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function CertificationsTable({ certifications }: CertificationsTableProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [bulkSending, setBulkSending] = useState(false)

  // Filter certifications by search
  const filtered = useMemo(() => {
    if (!searchTerm) return certifications
    const term = searchTerm.toLowerCase()
    return certifications.filter((cert) => {
      const name = `${cert.first_name} ${cert.last_name}`.toLowerCase()
      const email = (cert.email || '').toLowerCase()
      return name.includes(term) || email.includes(term)
    })
  }, [certifications, searchTerm])

  const pendingCerts = filtered.filter(
    (c) => c.email_status === 'pending' || c.email_status === 'failed'
  )

  async function handleSendEmail(certId: string) {
    setSendingIds((prev) => new Set(prev).add(certId))
    try {
      const res = await fetch('/api/certifications/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certification_id: certId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to send email: ${data.error || 'Unknown error'}`)
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to send certification email:', err)
      alert('Failed to send email. Check console for details.')
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev)
        next.delete(certId)
        return next
      })
    }
  }

  async function handleBulkSend() {
    if (pendingCerts.length === 0) return
    const confirmed = window.confirm(
      `Send certification emails to ${pendingCerts.length} recipient${pendingCerts.length !== 1 ? 's' : ''}?`
    )
    if (!confirmed) return

    setBulkSending(true)
    const ids = pendingCerts.map((c) => c.id)
    let successCount = 0
    let failCount = 0

    for (const id of ids) {
      try {
        const res = await fetch('/api/certifications/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certification_id: id }),
        })
        if (res.ok) {
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    setBulkSending(false)
    if (failCount > 0) {
      alert(`Sent ${successCount} emails. ${failCount} failed.`)
    }
    router.refresh()
  }

  return (
    <div>
      {/* Controls */}
      <div className="px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 px-3 py-1.5 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#5B9A8B] transition-colors"
            />
            <span className="text-xs text-[var(--color-text-muted)]">
              {filtered.length} of {certifications.length} certificates
            </span>
          </div>
          <div className="flex items-center gap-2">
            {pendingCerts.length > 0 && (
              <button
                onClick={handleBulkSend}
                disabled={bulkSending}
                className="px-4 py-1.5 text-sm font-medium rounded border border-[rgba(91,154,139,0.4)] text-[#5B9A8B] hover:bg-[rgba(91,154,139,0.1)] disabled:opacity-50 transition-colors"
              >
                {bulkSending ? 'Sending...' : `Send All Pending (${pendingCerts.length})`}
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-1.5 text-sm font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] transition-colors"
            >
              Add Certification
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Name
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Email
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Company
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Cohort
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Certificate No.
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Issued
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Email Status
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((cert) => {
              const isSending = sendingIds.has(cert.id)
              const status = cert.email_status || 'pending'
              const canSend = status === 'pending' || status === 'failed'

              return (
                <tr
                  key={cert.id}
                  className={`border-b border-[var(--color-border)] last:border-b-0 ${isSending ? 'opacity-50' : ''}`}
                >
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {cert.first_name} {cert.last_name}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[var(--color-text-secondary)]">
                    {cert.email}
                  </td>
                  <td className="py-3 px-4 text-[var(--color-text-secondary)]">
                    {cert.company || '-'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {cert.cohort ? (
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-[rgba(107,141,214,0.12)] text-[#6B8DD6] border border-[rgba(107,141,214,0.25)]">
                        {cert.cohort}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-[var(--color-text-secondary)]">
                    {cert.certificate_number || '-'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-[var(--color-text-secondary)]">
                    {formatDate(cert.issued_at)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded border ${
                        emailStatusColors[status] ||
                        'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border-[rgba(232,230,227,0.15)]'
                      }`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {canSend && (
                        <button
                          onClick={() => handleSendEmail(cert.id)}
                          disabled={isSending}
                          className="px-3 py-1 text-xs font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] disabled:opacity-50 transition-colors"
                        >
                          {isSending ? 'Sending...' : 'Send Email'}
                        </button>
                      )}
                      {cert.token && (
                        <a
                          href={`${CERTIFICATE_BASE_URL}/${cert.certificate_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-xs font-medium rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors"
                        >
                          View
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-6 py-12 text-center text-[var(--color-text-muted)]"
                >
                  {searchTerm
                    ? 'No certifications match your search'
                    : 'No certifications yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Certification Modal */}
      {showAddModal && (
        <AddCertificationModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Add Certification Modal                                           */
/* ------------------------------------------------------------------ */

function AddCertificationModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    company: '',
    cohort: 'May 18th 2026',
    program: '8-week',
  })

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name || !form.last_name || !form.email) {
      alert('First name, last name, and email are required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/certifications/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          company: form.company || null,
          cohort: form.cohort,
          program: form.program,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(`Failed to create certification: ${data.error || 'Unknown error'}`)
      } else {
        onClose()
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to create certification:', err)
      alert('Failed to create certification. Check console for details.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-lg shadow-xl max-w-lg w-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Add Certification
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Create a new certificate record
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                First Name *
              </label>
              <input
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#5B9A8B] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Last Name *
              </label>
              <input
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#5B9A8B] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Email *
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#5B9A8B] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Company
            </label>
            <input
              type="text"
              name="company"
              value={form.company}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#5B9A8B] transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Cohort
              </label>
              <select
                name="cohort"
                value={form.cohort}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:outline-none focus:border-[#5B9A8B] transition-colors"
              >
                {COHORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Program
              </label>
              <input
                type="text"
                name="program"
                value={form.program}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#5B9A8B] transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Certificate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
