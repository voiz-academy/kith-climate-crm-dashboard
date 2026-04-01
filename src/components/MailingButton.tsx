'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { TemplateAutomationTable } from './TemplateAutomationTable'
import { FUNNEL_LABELS, type FunnelStatus } from '@/lib/supabase'

type Template = {
  id: string
  name: string
  subject: string
  funnel_trigger: string | null
  is_active: 'active' | 'partial' | 'inactive'
}

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

interface MailingButtonProps {
  templates: Template[]
  pendingEmailCount: number
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
  requested_discount: 'bg-[rgba(234,179,8,0.15)] text-[#EAB308] border-[rgba(234,179,8,0.3)]',
  deferred_next_cohort: 'bg-[rgba(234,179,8,0.15)] text-[#EAB308] border-[rgba(234,179,8,0.3)]',
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function MailingButton({ templates, pendingEmailCount }: MailingButtonProps) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] transition-colors text-sm font-medium"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        Mailing
        {pendingEmailCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#D97706] text-white text-xs font-bold">
            {pendingEmailCount}
          </span>
        )}
      </button>

      {showModal && (
        <MailingModal
          templates={templates}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

function MailingModal({ templates, onClose }: { templates: Template[]; onClose: () => void }) {
  const router = useRouter()
  const [tab, setTab] = useState<'automations' | 'pending'>('automations')
  const [pendingEmails, setPendingEmails] = useState<PendingEmailWithJoins[]>([])
  const [loadingEmails, setLoadingEmails] = useState(true)
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)

  const fetchPendingEmails = useCallback(async () => {
    setLoadingEmails(true)
    try {
      const res = await fetch('/api/pending-emails')
      if (res.ok) {
        const data = await res.json()
        setPendingEmails(data)
      }
    } catch (err) {
      console.error('Failed to fetch pending emails:', err)
    } finally {
      setLoadingEmails(false)
    }
  }, [])

  useEffect(() => {
    fetchPendingEmails()
  }, [fetchPendingEmails])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleEmailAction(ids: string[], action: 'approve' | 'reject') {
    if (ids.length === 1) {
      setProcessing(prev => new Set(prev).add(ids[0]))
    } else {
      setBulkProcessing(true)
    }

    try {
      const res = await fetch(`/api/pending-emails/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })

      const data = await res.json()
      const succeededIds = new Set<string>()
      const failedMessages: string[] = []

      if (data.results) {
        for (const r of data.results) {
          if (r.action === 'approved_and_sent' || r.action === 'rejected') {
            succeededIds.add(r.id)
          } else {
            failedMessages.push(r.action)
          }
        }
      } else if (res.ok) {
        ids.forEach(id => succeededIds.add(id))
      }

      if (succeededIds.size > 0) {
        setPendingEmails(prev => prev.filter(e => !succeededIds.has(e.id)))
        router.refresh()
      }

      if (failedMessages.length > 0) {
        alert(`Some emails failed:\n${failedMessages.join('\n')}`)
      }
    } catch (err) {
      console.error(`Failed to ${action} emails:`, err)
    } finally {
      if (ids.length === 1) {
        setProcessing(prev => { const next = new Set(prev); next.delete(ids[0]); return next })
      } else {
        setBulkProcessing(false)
      }
    }
  }

  const activeCount = templates.filter(t => t.is_active === 'active').length
  const partialCount = templates.filter(t => t.is_active === 'partial').length

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--color-card)] rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Mailing</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {activeCount} auto-send · {partialCount} approval · {pendingEmails.length} pending
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] shrink-0">
          <button
            onClick={() => setTab('automations')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              tab === 'automations'
                ? 'text-[#5B9A8B] border-b-2 border-[#5B9A8B]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Automations
          </button>
          <button
            onClick={() => setTab('pending')}
            className={`px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === 'pending'
                ? 'text-[#5B9A8B] border-b-2 border-[#5B9A8B]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Pending Emails
            {pendingEmails.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#D97706] text-white text-xs font-bold">
                {pendingEmails.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {tab === 'automations' ? (
            <TemplateAutomationTable templates={templates} />
          ) : (
            <div className="p-6">
              {/* Bulk actions */}
              {pendingEmails.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => handleEmailAction(pendingEmails.map(e => e.id), 'approve')}
                    disabled={bulkProcessing}
                    className="px-4 py-1.5 text-sm font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] disabled:opacity-50 transition-colors"
                  >
                    {bulkProcessing ? 'Processing...' : `Send All (${pendingEmails.length})`}
                  </button>
                  <button
                    onClick={() => handleEmailAction(pendingEmails.map(e => e.id), 'reject')}
                    disabled={bulkProcessing}
                    className="px-4 py-1.5 text-sm font-medium rounded border border-[rgba(239,68,68,0.4)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 transition-colors"
                  >
                    Reject All
                  </button>
                </div>
              )}

              {loadingEmails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5B9A8B]" />
                </div>
              ) : pendingEmails.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[var(--color-text-muted)]">No pending emails</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">All automated emails have been reviewed</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingEmails.map((email) => {
                    const customer = email.customers
                    const template = email.email_templates
                    const detail = email.trigger_detail
                    const name = customer
                      ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email
                      : detail?.customer_name || 'Unknown'
                    const customerEmail = customer?.email || detail?.customer_email || ''
                    const templateName = template?.name || detail?.template_name || email.trigger_event
                    const templateSubject = template?.subject || detail?.template_subject || ''
                    const isProcessing = processing.has(email.id)

                    return (
                      <div key={email.id} className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${isProcessing ? 'opacity-50' : ''}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-[var(--color-text-primary)]">{name}</span>
                            {customerEmail && name !== customerEmail && (
                              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{customerEmail}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleEmailAction([email.id], 'approve')}
                              disabled={isProcessing}
                              className="px-3 py-1 text-xs font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] disabled:opacity-50 transition-colors"
                            >Send</button>
                            <button
                              onClick={() => handleEmailAction([email.id], 'reject')}
                              disabled={isProcessing}
                              className="px-3 py-1 text-xs font-medium rounded border border-[rgba(239,68,68,0.4)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 transition-colors"
                            >Reject</button>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            <span className="font-medium">Template:</span> {templateName}
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            <span className="font-medium">Subject:</span> {templateSubject}
                          </p>
                        </div>
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
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-2">Queued {formatDate(email.created_at)}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
