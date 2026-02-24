'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface AddInterviewModalProps {
  onClose: () => void
  onCreated: () => void
}

interface FathomCheck {
  found: boolean
  id?: string
  has_fathom_data?: boolean
  has_transcript?: boolean
  fathom_url?: string | null
  interviewer?: string
  outcome?: string
  conducted_at?: string
}

interface CustomerResult {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  funnel_status: string
  linkedin_company: string | null
  linkedin_title: string | null
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
  const [success, setSuccess] = useState<{
    customer_created: boolean
    booking_linked: boolean
    action: 'created' | 'updated'
    had_fathom_data: boolean
  } | null>(null)

  // Customer search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  // Fathom check state
  const [fathomCheck, setFathomCheck] = useState<FathomCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Customer search — debounced fetch
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    setSearching(true)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(searchQuery)}`)
        if (res.ok) {
          const data: CustomerResult[] = await res.json()
          setSearchResults(data)
          setShowDropdown(data.length > 0)
        }
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Select a customer from search results
  function handleSelectCustomer(customer: CustomerResult) {
    setSelectedCustomer(customer)
    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ')
    setName(fullName)
    setEmail(customer.email)
    setSearchQuery(fullName || customer.email)
    setShowDropdown(false)
  }

  // Clear selected customer (allow manual entry)
  function handleClearCustomer() {
    setSelectedCustomer(null)
    setSearchQuery('')
    setEmail('')
    setName('')
  }

  // Check for existing Fathom interview when email or date changes
  const checkFathomInterview = useCallback(async (emailVal: string, dateVal: string) => {
    // Need a valid email and date
    if (!emailVal || !emailVal.includes('@') || !dateVal) {
      setFathomCheck(null)
      return
    }

    setChecking(true)
    try {
      const params = new URLSearchParams({
        email: emailVal.trim(),
        date: dateVal,
      })
      const res = await fetch(`/api/interviews/check?${params}`)
      if (res.ok) {
        const data: FathomCheck = await res.json()
        setFathomCheck(data)
      } else {
        setFathomCheck(null)
      }
    } catch {
      setFathomCheck(null)
    } finally {
      setChecking(false)
    }
  }, [])

  // Debounced check trigger
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      checkFathomInterview(email, conductedAt)
    }, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [email, conductedAt, checkFathomInterview])

  const isUpdate = fathomCheck?.found === true
  const hasFathomData = fathomCheck?.has_fathom_data === true

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
        action: data.action,
        had_fathom_data: data.had_fathom_data,
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
            {isUpdate ? 'Update Interview' : 'Add Interview'}
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

        {/* Fathom match banner */}
        {isUpdate && hasFathomData && (
          <div className="mx-6 mt-4 p-3 rounded bg-[rgba(99,102,241,0.1)] border border-[rgba(99,102,241,0.3)] text-sm">
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                <path d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4" />
              </svg>
              <div>
                <p className="text-[#818CF8] font-medium">Fathom recording found</p>
                <p className="text-[var(--color-text-muted)] mt-0.5">
                  A recording already exists for this email and date
                  {fathomCheck?.has_transcript && ' (with transcript)'}.
                  Your form submission will update it with outcome and notes.
                </p>
                {fathomCheck?.fathom_url && (
                  <a
                    href={fathomCheck.fathom_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#818CF8] hover:text-[#A5B4FC] text-xs mt-1 inline-block underline"
                  >
                    View recording
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Existing row without Fathom (previous manual entry) */}
        {isUpdate && !hasFathomData && (
          <div className="mx-6 mt-4 p-3 rounded bg-[rgba(234,179,8,0.1)] border border-[rgba(234,179,8,0.3)] text-sm">
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-[#EAB308] font-medium">Existing interview row found</p>
                <p className="text-[var(--color-text-muted)] mt-0.5">
                  A manual entry already exists for this email and date.
                  Submitting will update it with your new values.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="mx-6 mt-4 p-3 rounded bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.3)] text-[#22C55E] text-sm">
            {success.action === 'updated'
              ? <>Interview updated successfully.{success.had_fathom_data && ' Fathom recording data preserved.'}</>
              : <>Interview created successfully.</>
            }
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
          {/* Customer Search */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Customer *
            </label>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded border border-[#5B9A8B] bg-[rgba(91,154,139,0.08)] text-sm">
                <div className="flex-1 min-w-0">
                  <span className="text-[var(--color-text-primary)] font-medium">
                    {[selectedCustomer.first_name, selectedCustomer.last_name].filter(Boolean).join(' ') || 'No name'}
                  </span>
                  <span className="text-[var(--color-text-muted)] ml-2">{selectedCustomer.email}</span>
                  {selectedCustomer.linkedin_company && (
                    <span className="text-[var(--color-text-muted)] ml-2 text-xs">· {selectedCustomer.linkedin_company}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors flex-shrink-0"
                  title="Clear selection"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true) }}
                  placeholder="Search by name or email…"
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors"
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[var(--color-text-muted)] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {/* Search Results Dropdown */}
            {showDropdown && searchResults.length > 0 && !selectedCustomer && (
              <div className="absolute z-10 mt-1 w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((c) => {
                  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ')
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[var(--color-surface)] transition-colors border-b border-[var(--color-border)] last:border-b-0"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {fullName || 'No name'}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)] truncate">{c.email}</span>
                      </div>
                      {(c.linkedin_title || c.linkedin_company) && (
                        <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          {[c.linkedin_title, c.linkedin_company].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* No results message */}
            {showDropdown && searchResults.length === 0 && !searching && searchQuery.length >= 2 && !selectedCustomer && (
              <div className="absolute z-10 mt-1 w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
                No customers found. You can enter email and name manually below.
              </div>
            )}
          </div>

          {/* Email (auto-filled from customer or manual) */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Interviewee Email *
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                readOnly={!!selectedCustomer}
                className={`w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors ${selectedCustomer ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
              {checking && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-[var(--color-text-muted)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Name (auto-filled from customer or manual) */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Interviewee Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              readOnly={!!selectedCustomer}
              className={`w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[#5B9A8B] transition-colors ${selectedCustomer ? 'opacity-60 cursor-not-allowed' : ''}`}
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
              {submitting
                ? (isUpdate ? 'Updating...' : 'Creating...')
                : (isUpdate ? 'Update Interview' : 'Create Interview')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
