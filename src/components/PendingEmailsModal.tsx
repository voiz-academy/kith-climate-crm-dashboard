'use client'

import { useEffect, useState, useCallback } from 'react'
import { FUNNEL_LABELS, type FunnelStatus } from '@/lib/supabase'

type PendingEmailWithJoins = {
  id: string
  customer_id: string
  template_id: string
  trigger_event: string
  trigger_detail: {
    old_status?: string
    new_status?: string
    cohort?: string
    customer_name?: string
    customer_email?: string
    template_name?: string
    template_subject?: string
  } | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  customers: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    funnel_status: string
  } | null
  email_templates: {
    id: string
    name: string
    subject: string
  } | null
}

interface PendingEmailsModalProps {
  onClose: () => void
  onUpdated?: () => void
}

const stageColors: Record<string, string> = {
  registered: 'bg-[rgba(91,154,139,0.10)] text-[#5B9A8B] border-[rgba(91,154,139,0.25)]',
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
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  const label = FUNNEL_LABELS[status as FunnelStatus] ?? status
  const colors = stageColors[status] ?? 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)]'
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${colors}`}>
      {label}
    </span>
  )
}

export function PendingEmailsModal({ onClose, onUpdated }: PendingEmailsModalProps) {
  const [emails, setEmails] = useState<PendingEmailWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)

  const fetchEmails = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pending-emails')
      if (res.ok) {
        const data = await res.json()
        setEmails(data)
      }
    } catch (err) {
      console.error('Failed to fetch pending emails:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    fetchEmails()
  }, [fetchEmails])

  async function handleAction(ids: string[], action: 'approve' | 'reject') {
    const endpoint = `/api/pending-emails/${action}`

    if (ids.length === 1) {
      setProcessing(prev => new Set(prev).add(ids[0]))
    } else {
      setBulkProcessing(true)
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })

      if (res.ok) {
        setEmails(prev => prev.filter(e => !ids.includes(e.id)))
        onUpdated?.()
      }
    } catch (err) {
      console.error(`Failed to ${action} emails:`, err)
    } finally {
      if (ids.length === 1) {
        setProcessing(prev => {
          const next = new Set(prev)
          next.delete(ids[0])
          return next
        })
      } else {
        setBulkProcessing(false)
      }
    }
  }

  const allIds = emails.map(e => e.id)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Pending Email Approvals
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {loading ? 'Loading...' : `${emails.length} email${emails.length !== 1 ? 's' : ''} waiting for approval`}
            </p>
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

        {/* Bulk Actions */}
        {emails.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--color-border)] shrink-0">
            <button
              onClick={() => handleAction(allIds, 'approve')}
              disabled={bulkProcessing}
              className="px-4 py-1.5 text-sm font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] disabled:opacity-50 transition-colors"
            >
              {bulkProcessing ? 'Processing...' : `Send All (${emails.length})`}
            </button>
            <button
              onClick={() => handleAction(allIds, 'reject')}
              disabled={bulkProcessing}
              className="px-4 py-1.5 text-sm font-medium rounded border border-[rgba(239,68,68,0.4)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 transition-colors"
            >
              Reject All
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5B9A8B]" />
            </div>
          ) : emails.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--color-text-muted)]">No pending emails</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                All automated emails have been reviewed
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {emails.map((email) => (
                <EmailCard
                  key={email.id}
                  email={email}
                  isProcessing={processing.has(email.id)}
                  onApprove={() => handleAction([email.id], 'approve')}
                  onReject={() => handleAction([email.id], 'reject')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmailCard({
  email,
  isProcessing,
  onApprove,
  onReject,
}: {
  email: PendingEmailWithJoins
  isProcessing: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const customer = email.customers
  const template = email.email_templates
  const detail = email.trigger_detail

  const name = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email
    : detail?.customer_name || 'Unknown'

  const customerEmail = customer?.email || detail?.customer_email || ''
  const templateName = template?.name || detail?.template_name || email.trigger_event
  const templateSubject = template?.subject || detail?.template_subject || ''

  return (
    <div className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${isProcessing ? 'opacity-50' : ''}`}>
      {/* Customer + actions row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {name}
            </span>
          </div>
          {customerEmail && name !== customerEmail && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{customerEmail}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onApprove}
            disabled={isProcessing}
            className="px-3 py-1 text-xs font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] disabled:opacity-50 transition-colors"
            title="Send"
          >
            Send
          </button>
          <button
            onClick={onReject}
            disabled={isProcessing}
            className="px-3 py-1 text-xs font-medium rounded border border-[rgba(239,68,68,0.4)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 transition-colors"
            title="Reject"
          >
            Reject
          </button>
        </div>
      </div>

      {/* Template info */}
      <div className="mt-2 space-y-1">
        <p className="text-xs text-[var(--color-text-secondary)]">
          <span className="font-medium">Template:</span> {templateName}
        </p>
        <p className="text-xs text-[var(--color-text-secondary)]">
          <span className="font-medium">Subject:</span> {templateSubject}
        </p>
      </div>

      {/* Trigger status change */}
      {detail?.old_status && detail?.new_status && (
        <div className="flex items-center gap-2 mt-2">
          <StatusBadge status={detail.old_status} />
          <span className="text-xs text-[var(--color-text-muted)]">&rarr;</span>
          <StatusBadge status={detail.new_status} />
          {detail.cohort && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[rgba(107,141,214,0.12)] text-[#6B8DD6] border border-[rgba(107,141,214,0.25)]">
              {detail.cohort}
            </span>
          )}
        </div>
      )}

      {/* Created timestamp */}
      <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
        Queued {formatDate(email.created_at)}
      </p>
    </div>
  )
}
