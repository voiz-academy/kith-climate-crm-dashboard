'use client'

import { useEffect, useState } from 'react'

interface AddInterviewModalProps {
  onClose: () => void
  onCreated: () => void
}

const INTERVIEWERS = ['Ben Hillier', 'Diego Espinosa']
const OUTCOMES = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'waitlisted', label: 'Waitlisted' },
]
const COHORT_OPTIONS = [
  { value: '', label: 'No cohort' },
  { value: 'March 16th 2026', label: 'March 16th 2026' },
]

export function AddInterviewModal({ onClose, onCreated }: AddInterviewModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ customer_created: boolean; booking_linked: boolean } | null>(null)

  // Form state
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [interviewer, setInterviewer] = useState(INTERVIEWERS[0])
  const [conductedAt, setConductedAt] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [outcome, setOutcome] = useState('pending')
  const [outcomeReason, setOutcomeReason] = useState('')
  const [notes, setNotes] = useState('')
  const [cohort, setCohort] = useState('March 16th 2026')

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewee_email: email,
          interviewee_name: name || undefined,
          interviewer,
          conducted_at: new Date(conductedAt).toISOString(),
          outcome,
          outcome_reason: outcomeReason || undefined,
          interviewer_notes: notes || undefined,
          cohort: cohort || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setSuccess({
        customer_created: data.customer_created,
        booking_linked: data.booking_linked,
      })

      // Auto-close after 2s and refresh
      setTimeout(() => {
        onCreated()
        onClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
        className="bg-[var(--color-card)] rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Add Interview
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Success message */}
        {success && (
          <div className="mx-6 mt-4 p-3 rounded bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.3)] text-[#22C55E] text-sm">
            Interview created successfully.
            {success.customer_created && ' New customer record created.'}
            {success.booking_linked && ' Linked to existing booking.'}
            {!success.booking_linked && (
              <span className="text-[#EAB308]"> No matching booking found.</span>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#EF4444] text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Interviewee Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Interviewee Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors"
            />
          </div>

          {/* Interviewer + Date row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Interviewer *
              </label>
              <select
                required
                value={interviewer}
                onChange={(e) => setInterviewer(e.target.value)}
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors"
              >
                {INTERVIEWERS.map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={conductedAt}
                onChange={(e) => setConductedAt(e.target.value)}
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors"
              />
            </div>
          </div>

          {/* Outcome + Cohort row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Outcome
              </label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors"
              >
                {OUTCOMES.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Cohort
              </label>
              <select
                value={cohort}
                onChange={(e) => setCohort(e.target.value)}
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors"
              >
                {COHORT_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Outcome reason (shown when not pending) */}
          {outcome !== 'pending' && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Outcome Reason
              </label>
              <input
                type="text"
                value={outcomeReason}
                onChange={(e) => setOutcomeReason(e.target.value)}
                placeholder="Brief reason for decision"
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Interviewer Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes about the interview"
              className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !!success}
              className="px-4 py-2 rounded bg-[#5B9A8B] text-white text-sm font-medium hover:bg-[#4a8474] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating...' : 'Create Interview'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
