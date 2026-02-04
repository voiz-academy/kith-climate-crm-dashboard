'use client'

import { useEffect } from 'react'
import { LeadWithAttendance } from '@/lib/supabase'

interface LeadDetailModalProps {
  lead: LeadWithAttendance
  onClose: () => void
}

const leadTypeColors = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

export function LeadDetailModal({ lead, onClose }: LeadDetailModalProps) {
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
              {lead.first_name} {lead.last_name}
            </h2>
            {lead.linkedin_headline && (
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                {lead.linkedin_headline}
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
          {/* Type Badge & LinkedIn Button */}
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1.5 text-sm font-medium rounded ${leadTypeColors[lead.lead_type]}`}>
              {lead.lead_type}
            </span>
            {lead.linkedin_url && (
              <a
                href={lead.linkedin_url}
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
            <InfoItem label="Email" value={lead.email} />
            <InfoItem label="Company" value={lead.linkedin_company || lead.company_domain} />
            <InfoItem label="Title" value={lead.linkedin_title} />
            <InfoItem label="Industry" value={lead.linkedin_industry} />
            <InfoItem label="Location" value={lead.linkedin_location} />
            <InfoItem
              label="Confidence"
              value={lead.classification_confidence}
            />
          </div>

          {/* Attendance History */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              Workshop Attendance
            </h3>
            {lead.attended_dates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {lead.attended_dates.sort().map((date) => (
                  <span
                    key={date}
                    className="px-3 py-1.5 rounded bg-[rgba(91,154,139,0.1)] text-[#5B9A8B] text-sm"
                  >
                    {formatDate(date)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No workshops attended</p>
            )}
          </div>

          {/* Climate Signals (if available) */}
          {lead.climate_signals && Object.keys(lead.climate_signals).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Climate Signals
              </h3>
              <div className="bg-[var(--color-surface)] rounded p-4">
                <pre className="text-xs text-[var(--color-text-secondary)] overflow-x-auto">
                  {JSON.stringify(lead.climate_signals, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-[var(--color-border)]">
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Created: {formatDate(lead.created_at)}</span>
              <span>Updated: {formatDate(lead.updated_at)}</span>
            </div>
          </div>
        </div>
      </div>
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
