'use client'

import { useState, useMemo } from 'react'

export type Testimonial = {
  id: string
  certification_id: string | null
  customer_id: string | null
  token: string
  first_name: string | null
  last_name: string | null
  email: string | null
  cohort: string | null
  testimonial_text: string | null
  rating: number | null
  role_at_time: string | null
  company_at_time: string | null
  linkedin_url: string | null
  consent_to_publish: boolean | null
  status: 'pending' | 'submitted' | 'approved' | 'rejected'
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
}

interface TestimonialsTableProps {
  testimonials: Testimonial[]
}

const STATUS_BADGES: Record<Testimonial['status'], { label: string; className: string }> = {
  pending: {
    label: 'Awaiting Submission',
    className: 'bg-[rgba(232,230,227,0.1)] text-[var(--color-text-secondary)] border border-[rgba(232,230,227,0.1)]',
  },
  submitted: {
    label: 'Needs Review',
    className: 'bg-[rgba(217,119,6,0.15)] text-[#D97706] border border-[rgba(217,119,6,0.3)]',
  },
  approved: {
    label: 'Approved',
    className: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)]',
  },
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null || rating === undefined) return <span className="text-[var(--color-text-muted)]">--</span>
  return (
    <span className="text-[#5B9A8B] tracking-wider">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < rating ? '\u2605' : '\u2606'}</span>
      ))}
    </span>
  )
}

function StatusBadge({ status }: { status: Testimonial['status'] }) {
  const badge = STATUS_BADGES[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  )
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function TestimonialsTable({ testimonials }: TestimonialsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Filter testimonials
  const filtered = useMemo(() => {
    return testimonials.filter(t => {
      // Status filter
      if (statusFilter !== 'all' && t.status !== statusFilter) return false

      // Search filter
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const searchFields = [
          t.first_name,
          t.last_name,
          t.email,
          t.company_at_time,
          t.cohort,
          t.role_at_time,
        ].filter(Boolean).map(f => f!.toLowerCase())

        if (!searchFields.some(field => field.includes(q))) return false
      }

      return true
    })
  }, [testimonials, searchTerm, statusFilter])

  async function handleReview(testimonialId: string, newStatus: 'approved' | 'rejected') {
    setProcessingIds(prev => new Set(prev).add(testimonialId))
    try {
      const res = await fetch('/api/testimonials/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testimonial_id: testimonialId,
          status: newStatus,
          reviewed_by: 'crm_admin',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Review failed (${res.status})`)
      }
      // Reload page to reflect changes
      window.location.reload()
    } catch (err) {
      console.error('Review error:', err)
      alert(`Failed to ${newStatus} testimonial. Check console for details.`)
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev)
        next.delete(testimonialId)
        return next
      })
    }
  }

  function handleCopyLink(testimonial: Testimonial) {
    // Build the submission URL using the token
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    // The testimonial submission link — uses the public-facing app URL pattern
    const link = `${baseUrl.replace('crm.', 'app.')}/testimonial/${testimonial.token}`
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(testimonial.id)
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => {
      // Fallback: copy a simpler URL pattern
      const fallbackLink = `https://app.kithclimate.com/testimonial/${testimonial.token}`
      navigator.clipboard.writeText(fallbackLink).catch(() => {
        alert(`Testimonial link: ${fallbackLink}`)
      })
      setCopiedId(testimonial.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div>
      {/* Filters */}
      <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center gap-4">
        <input
          type="text"
          placeholder="Search by name, email, company..."
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value) }}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-hover)] w-72"
        />
        <div className="flex gap-1">
          {(['all', 'pending', 'submitted', 'approved', 'rejected'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                statusFilter === status
                  ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-card)]'
              }`}
            >
              {status === 'all' ? 'All' : STATUS_BADGES[status].label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-[var(--color-text-muted)]">
          {filtered.length} of {testimonials.length} testimonial{testimonials.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Company
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Cohort
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Rating
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Submitted
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => {
              const isExpanded = expandedId === t.id
              const isProcessing = processingIds.has(t.id)

              return (
                <tr key={t.id} className="group">
                  {/* Main row */}
                  <td
                    colSpan={7}
                    className="p-0"
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      className="grid cursor-pointer border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors"
                      style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
                    >
                      <div className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[var(--color-text-primary)]">
                          {t.first_name} {t.last_name}
                        </div>
                        {t.role_at_time && (
                          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{t.role_at_time}</div>
                        )}
                      </div>
                      <div className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                        {t.company_at_time || '--'}
                      </div>
                      <div className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                        {t.cohort || '--'}
                      </div>
                      <div className="px-6 py-4 whitespace-nowrap text-sm">
                        <StarRating rating={t.rating} />
                      </div>
                      <div className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                        {formatDate(t.submitted_at)}
                      </div>
                      <div className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                          {t.status === 'submitted' && (
                            <>
                              <button
                                onClick={() => handleReview(t.id, 'approved')}
                                disabled={isProcessing}
                                className="px-2.5 py-1 rounded text-xs font-medium bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)] hover:bg-[rgba(91,154,139,0.25)] transition-colors disabled:opacity-50"
                              >
                                {isProcessing ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleReview(t.id, 'rejected')}
                                disabled={isProcessing}
                                className="px-2.5 py-1 rounded text-xs font-medium bg-[rgba(232,230,227,0.05)] text-[var(--color-text-secondary)] border border-[rgba(232,230,227,0.1)] hover:bg-[rgba(232,230,227,0.1)] transition-colors disabled:opacity-50"
                              >
                                {isProcessing ? '...' : 'Reject'}
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleCopyLink(t)}
                            className="px-2.5 py-1 rounded text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(232,230,227,0.05)] transition-colors"
                          >
                            {copiedId === t.id ? 'Copied!' : 'Copy Link'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-6 py-4 bg-[rgba(91,154,139,0.02)] border-b border-[var(--color-border-subtle)]">
                        {t.testimonial_text ? (
                          <div className="max-w-3xl">
                            <p className="text-sm text-[var(--color-text-secondary)] italic leading-relaxed">
                              &ldquo;{t.testimonial_text}&rdquo;
                            </p>
                            <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                              {t.email && <span>{t.email}</span>}
                              {t.linkedin_url && (
                                <a
                                  href={t.linkedin_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
                                >
                                  LinkedIn
                                </a>
                              )}
                              {t.consent_to_publish !== null && (
                                <span>
                                  Consent to publish: {t.consent_to_publish ? 'Yes' : 'No'}
                                </span>
                              )}
                              {t.reviewed_at && (
                                <span>
                                  Reviewed {formatDate(t.reviewed_at)} by {t.reviewed_by || 'unknown'}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-[var(--color-text-muted)] italic">
                            No testimonial submitted yet. Link sent to {t.email || 'recipient'}.
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                  No testimonials match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
