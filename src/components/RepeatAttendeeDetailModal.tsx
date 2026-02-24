'use client'

import { useEffect, useState } from 'react'
import {
  Customer, Email, FunnelStatus, FUNNEL_LABELS,
  getEventLabel,
} from '@/lib/supabase'

export type EventRegistration = {
  event_name: string
  event_date: string
  attended: boolean
  registration_date: string
}

export type RepeatAttendee = Customer & {
  attended_dates: string[]
  registrations: EventRegistration[]
}

interface RepeatAttendeeDetailModalProps {
  attendee: RepeatAttendee
  onClose: () => void
}

const leadTypeColors: Record<string, string> = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

const stageColors: Record<string, string> = {
  registered: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border-[rgba(91,154,139,0.3)]',
  applied: 'bg-[rgba(82,144,127,0.15)] text-[#52907F] border-[rgba(82,144,127,0.3)]',
  invited_to_interview: 'bg-[rgba(73,133,115,0.15)] text-[#498573] border-[rgba(73,133,115,0.3)]',
  booked: 'bg-[rgba(64,122,103,0.15)] text-[#407A67] border-[rgba(64,122,103,0.3)]',
  interviewed: 'bg-[rgba(55,111,91,0.15)] text-[#376F5B] border-[rgba(55,111,91,0.3)]',
  invited_to_enrol: 'bg-[rgba(46,100,79,0.15)] text-[#2E644F] border-[rgba(46,100,79,0.3)]',
  enrolled: 'bg-[rgba(37,89,67,0.15)] text-[#255943] border-[rgba(37,89,67,0.3)]',
  application_rejected: 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border-[rgba(239,68,68,0.3)]',
  interview_rejected: 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border-[rgba(239,68,68,0.3)]',
  no_show: 'bg-[rgba(217,119,6,0.15)] text-[#D97706] border-[rgba(217,119,6,0.3)]',
  offer_expired: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border-[rgba(232,230,227,0.1)]',
  not_invited: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border-[rgba(232,230,227,0.1)]',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatEmailDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function RepeatAttendeeDetailModal({ attendee, onClose }: RepeatAttendeeDetailModalProps) {
  const [emails, setEmails] = useState<Email[]>([])
  const [emailsLoading, setEmailsLoading] = useState(true)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Fetch emails for this customer
  useEffect(() => {
    async function fetchEmails() {
      setEmailsLoading(true)
      try {
        const res = await fetch(`/api/emails?customer_id=${attendee.id}`)
        if (res.ok) {
          const data = await res.json()
          setEmails(data)
        }
      } catch (err) {
        console.error('Failed to fetch emails:', err)
      } finally {
        setEmailsLoading(false)
      }
    }
    fetchEmails()
  }, [attendee.id])

  // Sort registrations by event_date
  const sortedRegistrations = [...attendee.registrations].sort(
    (a, b) => a.event_date.localeCompare(b.event_date)
  )

  // Build cohort status entries
  const cohortEntries = attendee.cohort_statuses
    ? Object.entries(attendee.cohort_statuses)
    : []

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              {attendee.first_name} {attendee.last_name}
            </h2>
            {attendee.linkedin_headline && (
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                {attendee.linkedin_headline}
              </p>
            )}
          </div>
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

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Type Badge, Funnel Status & LinkedIn Button */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`px-3 py-1.5 text-sm font-medium rounded ${leadTypeColors[attendee.lead_type]}`}>
              {attendee.lead_type}
            </span>
            <span className={`px-3 py-1.5 text-sm font-medium rounded border ${stageColors[attendee.funnel_status] || stageColors.registered}`}>
              {FUNNEL_LABELS[attendee.funnel_status] || attendee.funnel_status}
            </span>
            {attendee.linkedin_url && (
              <a
                href={attendee.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded border border-[#0077B5] text-[#0077B5] hover:bg-[rgba(0,119,181,0.1)] transition-colors text-sm font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                View Profile
              </a>
            )}
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem label="Email" value={attendee.email} />
            <InfoItem label="Company" value={attendee.linkedin_company || attendee.company_domain} />
            <InfoItem label="Title" value={attendee.linkedin_title} />
            <InfoItem label="Industry" value={attendee.linkedin_industry} />
            <InfoItem label="Location" value={attendee.linkedin_location} />
            <InfoItem label="Confidence" value={attendee.classification_confidence} />
          </div>

          {/* Event Registrations */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              Event Registrations ({sortedRegistrations.length})
            </h3>
            {sortedRegistrations.length > 0 ? (
              <div className="space-y-2">
                {sortedRegistrations.map((reg, i) => (
                  <div
                    key={`${reg.event_date}-${i}`}
                    className="flex items-center justify-between p-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {getEventLabel(reg.event_date)}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        Registered {new Date(reg.registration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded shrink-0 ${
                        reg.attended
                          ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]'
                          : 'bg-[rgba(232,230,227,0.05)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
                      }`}
                    >
                      {reg.attended ? 'Attended' : 'Registered'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No registrations found</p>
            )}
          </div>

          {/* Cohort Statuses */}
          {cohortEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Cohort Statuses
              </h3>
              <div className="space-y-2">
                {cohortEntries.map(([cohort, entry]) => (
                  <div
                    key={cohort}
                    className="flex items-center justify-between p-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)]"
                  >
                    <span className="text-sm text-[var(--color-text-primary)] font-medium">{cohort}</span>
                    <span className={`px-2.5 py-1 text-xs font-medium rounded border ${stageColors[entry.status as string] || stageColors.registered}`}>
                      {FUNNEL_LABELS[entry.status as FunnelStatus] || entry.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Email History */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              Email History
            </h3>
            {emailsLoading ? (
              <p className="text-sm text-[var(--color-text-muted)]">Loading emails...</p>
            ) : emails.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No email history</p>
            ) : (
              <div className="space-y-2">
                {emails.map((email) => (
                  <EmailRow key={email.id} email={email} />
                ))}
              </div>
            )}
          </div>

          {/* Climate Signals */}
          {attendee.climate_signals && Object.keys(attendee.climate_signals).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Climate Signals
              </h3>
              <div className="bg-[var(--color-surface)] rounded p-4">
                <pre className="text-xs text-[var(--color-text-secondary)] overflow-x-auto">
                  {JSON.stringify(attendee.climate_signals, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-[var(--color-border)]">
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Created: {formatDate(attendee.created_at)}</span>
              <span>Updated: {formatDate(attendee.updated_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailRow({ email }: { email: Email }) {
  const isInbound = email.direction === 'inbound'

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] ${
        isInbound ? '' : 'border-l-2 border-l-[#5B9A8B]'
      }`}
    >
      <span
        className={`mt-0.5 text-sm font-mono shrink-0 ${
          isInbound ? 'text-[var(--color-text-muted)]' : 'text-[#5B9A8B]'
        }`}
        title={isInbound ? 'Inbound' : 'Outbound'}
      >
        {isInbound ? '\u2190' : '\u2192'}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[var(--color-text-primary)] truncate font-medium">
            {email.subject || '(no subject)'}
          </span>
          {email.email_type && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded bg-[rgba(91,154,139,0.1)] text-[#5B9A8B] shrink-0">
              {email.email_type}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
          {isInbound
            ? `From: ${email.from_address}`
            : `To: ${email.to_addresses.join(', ')}`}
        </p>
      </div>

      <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
        {formatEmailDate(email.sent_at)}
      </span>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--color-text-primary)]">
        {value || '-'}
      </dd>
    </div>
  )
}
