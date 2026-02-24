'use client'

import { useState, useEffect } from 'react'
import {
  Customer, CohortApplication, Interview, InterviewBooking, Email, Payment,
  FunnelStatus, FUNNEL_LABELS,
} from '@/lib/supabase'

interface FunnelCRMProps {
  customers: Customer[]
  applicationsByCustomer: Record<string, CohortApplication>
  interviewsByCustomer: Record<string, Interview>
  interviewInvitesByCustomer: Record<string, Email>
  enrolInvitesByCustomer: Record<string, Email>
  paymentsByCustomer: Record<string, Payment>
  bookingsByCustomer: Record<string, InterviewBooking>
  reminderCountsByCustomer: Record<string, number>
}

/** Ordered funnel stages with their associated rejection/side statuses */
const STAGE_SECTIONS: { stage: FunnelStatus; sideStatuses: FunnelStatus[] }[] = [
  { stage: 'applied', sideStatuses: ['application_rejected'] },
  { stage: 'invited_to_interview', sideStatuses: ['not_invited'] },
  { stage: 'booked', sideStatuses: [] },
  { stage: 'interviewed', sideStatuses: ['interview_rejected', 'no_show'] },
  { stage: 'invited_to_enrol', sideStatuses: ['offer_expired'] },
  { stage: 'enrolled', sideStatuses: [] },
]

const leadTypeColors: Record<string, string> = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

const sideStatusColors: Record<string, string> = {
  application_rejected: 'text-[#EF4444]',
  interview_rejected: 'text-[#EF4444]',
  no_show: 'text-[#D97706]',
  offer_expired: 'text-[var(--color-text-muted)]',
  not_invited: 'text-[var(--color-text-muted)]',
}

const stageHeaderColors: Record<string, string> = {
  applied: 'border-l-[#52907F]',
  invited_to_interview: 'border-l-[#498573]',
  booked: 'border-l-[#407A67]',
  interviewed: 'border-l-[#376F5B]',
  invited_to_enrol: 'border-l-[#2E644F]',
  enrolled: 'border-l-[#255943]',
}

const outcomeColors: Record<string, string> = {
  approved: 'bg-[rgba(34,197,94,0.15)] text-[#22C55E]',
  rejected: 'bg-[rgba(239,68,68,0.15)] text-[#EF4444]',
  waitlisted: 'bg-[rgba(234,179,8,0.15)] text-[#EAB308]',
  pending: 'bg-[rgba(232,230,227,0.08)] text-[rgba(232,230,227,0.5)]',
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

/** Full-screen customer detail modal */
function CustomerDetailModal({
  customer,
  application,
  interview,
  interviewInvite,
  enrolInvite,
  payment,
  booking,
  reminderCount,
  onClose,
}: {
  customer: Customer
  application?: CohortApplication
  interview?: Interview
  interviewInvite?: Email
  enrolInvite?: Email
  payment?: Payment
  booking?: InterviewBooking
  reminderCount: number
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {customer.first_name} {customer.last_name}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{customer.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Status & Classification */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Status & Classification</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <DetailRow label="Funnel Status" value={FUNNEL_LABELS[customer.funnel_status]} />
              <DetailRow label="Lead Type">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${leadTypeColors[customer.lead_type]}`}>
                  {customer.lead_type}
                </span>
              </DetailRow>
              <DetailRow label="Enrichment" value={customer.enrichment_status} />
              <DetailRow label="Customer Since" value={formatDate(customer.created_at)} />
            </div>
          </section>

          {/* LinkedIn / Professional */}
          {(customer.linkedin_title || customer.linkedin_company || customer.linkedin_url) && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Professional</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label="Title" value={customer.linkedin_title} />
                <DetailRow label="Company" value={customer.linkedin_company} />
                <DetailRow label="Industry" value={customer.linkedin_industry} />
                <DetailRow label="Location" value={customer.linkedin_location} />
                {customer.linkedin_headline && (
                  <div className="col-span-2">
                    <DetailRow label="Headline" value={customer.linkedin_headline} />
                  </div>
                )}
                {customer.linkedin_url && (
                  <div className="col-span-2">
                    <DetailRow label="LinkedIn">
                      <a
                        href={customer.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#5B9A8B] hover:underline truncate block max-w-[400px]"
                      >
                        {customer.linkedin_url}
                      </a>
                    </DetailRow>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Application */}
          {application && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Application</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label="Applied On" value={formatDate(application.created_at)} />
                <DetailRow label="Role" value={application.role} />
                <DetailRow label="UTM Source" value={application.utm_source || 'Direct'} />
                <DetailRow label="Budget Confirmed" value={application.budget_confirmed ? 'Yes' : application.budget_confirmed === false ? 'No' : '-'} />
                {application.background && (
                  <div className="col-span-2">
                    <DetailRow label="Background" value={application.background} />
                  </div>
                )}
                {application.goals && (
                  <div className="col-span-2">
                    <DetailRow label="Goals" value={application.goals} />
                  </div>
                )}
                {application.ai_view && (
                  <div className="col-span-2">
                    <DetailRow label="AI View" value={application.ai_view} />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Interview Invite */}
          {interviewInvite && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Interview Invite</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label="Invited On" value={formatDate(interviewInvite.sent_at)} />
                <DetailRow label="Reminders Sent" value={String(reminderCount)} />
              </div>
            </section>
          )}

          {/* Booking */}
          {booking && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Booking</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label="Scheduled For" value={formatDate(booking.scheduled_at)} />
                <DetailRow label="Interviewer" value={booking.interviewer_name} />
                {booking.cancelled_at && (
                  <>
                    <DetailRow label="Cancelled At" value={formatDate(booking.cancelled_at)} />
                    <DetailRow label="Cancel Reason" value={booking.cancel_reason} />
                  </>
                )}
                {booking.location_url && (
                  <div className="col-span-2">
                    <DetailRow label="Location">
                      <a
                        href={booking.location_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#5B9A8B] hover:underline truncate block max-w-[400px]"
                      >
                        {booking.location_url}
                      </a>
                    </DetailRow>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Interview */}
          {interview && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Interview</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label="Conducted On" value={formatDate(interview.conducted_at || interview.created_at)} />
                <DetailRow label="Interviewer" value={interview.interviewer} />
                <DetailRow label="Outcome">
                  {interview.outcome ? (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${outcomeColors[interview.outcome] || ''}`}>
                      {interview.outcome}
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--color-text-muted)]">-</span>
                  )}
                </DetailRow>
                <DetailRow label="Scoring" value={interview.applicant_scoring != null ? String(interview.applicant_scoring) : null} />
                {interview.outcome_reason && (
                  <div className="col-span-2">
                    <DetailRow label="Outcome Reason" value={interview.outcome_reason} />
                  </div>
                )}
                {interview.fathom_recording_url && (
                  <div className="col-span-2">
                    <DetailRow label="Recording">
                      <a
                        href={interview.fathom_recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#5B9A8B] hover:underline truncate block max-w-[400px]"
                      >
                        {interview.fathom_recording_url}
                      </a>
                    </DetailRow>
                  </div>
                )}
                {interview.fathom_summary && (
                  <div className="col-span-2">
                    <DetailRow label="Summary" value={interview.fathom_summary} />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Enrolment Invite */}
          {enrolInvite && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Enrolment Invite</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label="Invited On" value={formatDate(enrolInvite.sent_at)} />
                <DetailRow label="Deadline" value={
                  enrolInvite.sent_at
                    ? formatDate(new Date(new Date(enrolInvite.sent_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())
                    : '-'
                } />
              </div>
            </section>
          )}

          {/* Payment */}
          {payment && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Payment</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <DetailRow label="Paid On" value={formatDate(payment.paid_at)} />
                <DetailRow label="Amount" value={formatCurrency(payment.amount_cents, payment.currency)} />
                <DetailRow label="Product" value={payment.product} />
                <DetailRow label="Status" value={payment.status} />
                {payment.refunded_at && (
                  <DetailRow label="Refunded On" value={formatDate(payment.refunded_at)} />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

/** Simple label/value row for the detail modal */
function DetailRow({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--color-text-primary)] break-words">
        {children || value || '-'}
      </dd>
    </div>
  )
}

export function FunnelCRM({
  customers,
  applicationsByCustomer,
  interviewsByCustomer,
  interviewInvitesByCustomer,
  enrolInvitesByCustomer,
  paymentsByCustomer,
  bookingsByCustomer,
  reminderCountsByCustomer,
}: FunnelCRMProps) {
  const [expandedSides, setExpandedSides] = useState<Set<FunnelStatus>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  function toggleSide(status: FunnelStatus) {
    setExpandedSides(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  // Group customers by funnel status
  const byStatus = new Map<FunnelStatus, Customer[]>()
  customers.forEach(c => {
    const list = byStatus.get(c.funnel_status) || []
    list.push(c)
    byStatus.set(c.funnel_status, list)
  })

  async function handleRejectApplication(customerId: string) {
    if (!window.confirm('Are you sure you want to reject this application?')) return
    setActionLoading(customerId)
    try {
      const res = await fetch('/api/customers/reject-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(`Failed to reject application: ${data.error || 'Unknown error'}`)
        return
      }
      window.location.reload()
    } catch (err) {
      alert(`Failed to reject application: ${String(err)}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRejectInterview(customerId: string) {
    if (!window.confirm('Are you sure you want to reject this interview?')) return
    setActionLoading(customerId)
    try {
      const res = await fetch('/api/customers/reject-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(`Failed to reject interview: ${data.error || 'Unknown error'}`)
        return
      }
      window.location.reload()
    } catch (err) {
      alert(`Failed to reject interview: ${String(err)}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleNoShow(customerId: string) {
    if (!window.confirm('Are you sure you want to mark this customer as a no-show?')) return
    setActionLoading(customerId)
    try {
      const res = await fetch('/api/customers/no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(`Failed to mark as no-show: ${data.error || 'Unknown error'}`)
        return
      }
      window.location.reload()
    } catch (err) {
      alert(`Failed to mark as no-show: ${String(err)}`)
    } finally {
      setActionLoading(null)
    }
  }

  function renderStageColumns(stage: FunnelStatus): string[] {
    switch (stage) {
      case 'applied': return ['Applied On', 'Role', 'UTM Source', 'Actions']
      case 'invited_to_interview': return ['Invite Sent', 'Company', 'Reminded']
      case 'booked': return ['Scheduled', 'Status', 'Actions']
      case 'interviewed': return ['Interviewed On', 'Outcome', 'Interviewer', 'Actions']
      case 'invited_to_enrol': return ['Invite Sent', 'Deadline', 'Company']
      case 'enrolled': return ['Paid On', 'Amount', 'Product']
      default: return ['Company', 'Title']
    }
  }

  function renderCustomerCells(stage: FunnelStatus, customer: Customer) {
    switch (stage) {
      case 'applied': {
        const app = applicationsByCustomer[customer.id]
        return (
          <>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
              {formatDate(app?.created_at)}
            </td>
            <td className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] max-w-[180px] truncate">
              {app?.role || '-'}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-muted)]">
              {app?.utm_source || 'Direct'}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <button
                onClick={(e) => { e.stopPropagation(); handleRejectApplication(customer.id) }}
                disabled={actionLoading === customer.id}
                className="px-2 py-1 text-xs font-medium rounded border transition-colors text-[#EF4444] border-[rgba(239,68,68,0.3)] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === customer.id ? 'Rejecting...' : '\u2715 Reject'}
              </button>
            </td>
          </>
        )
      }
      case 'invited_to_interview': {
        const invite = interviewInvitesByCustomer[customer.id]
        const reminderCount = reminderCountsByCustomer[customer.id] || 0
        return (
          <>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
              {formatDate(invite?.sent_at)}
            </td>
            <td className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] max-w-[180px] truncate">
              {customer.linkedin_company || customer.company_domain || '-'}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-center">
              {reminderCount > 0 ? (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-[rgba(234,179,8,0.15)] text-[#EAB308]">
                  {reminderCount}
                </span>
              ) : (
                <span className="text-[var(--color-text-muted)]">0</span>
              )}
            </td>
          </>
        )
      }
      case 'booked': {
        const booking = bookingsByCustomer[customer.id]
        const scheduledDate = booking?.scheduled_at ? new Date(booking.scheduled_at) : null
        const isOverdue = scheduledDate ? scheduledDate < new Date() : false
        return (
          <>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm">
              <div className="flex items-center gap-2">
                {scheduledDate && (
                  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-[#EF4444]' : 'bg-[#22C55E]'}`} />
                )}
                <span className="text-[var(--color-text-secondary)]">{formatDate(booking?.scheduled_at)}</span>
              </div>
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm">
              {isOverdue ? (
                <span className="text-xs font-medium text-[#EF4444]">Needs update</span>
              ) : scheduledDate ? (
                <span className="text-xs font-medium text-[#22C55E]">Upcoming</span>
              ) : (
                <span className="text-[var(--color-text-muted)]">-</span>
              )}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <button
                onClick={(e) => { e.stopPropagation(); handleNoShow(customer.id) }}
                disabled={actionLoading === customer.id}
                className="px-2 py-1 text-xs font-medium rounded border transition-colors text-[#D97706] border-[rgba(217,119,6,0.3)] hover:bg-[rgba(217,119,6,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === customer.id ? 'Updating...' : 'No Show'}
              </button>
            </td>
          </>
        )
      }
      case 'interviewed': {
        const interview = interviewsByCustomer[customer.id]
        return (
          <>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
              {formatDate(interview?.conducted_at || interview?.created_at)}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              {interview?.outcome ? (
                <span className={`px-2 py-1 text-xs font-medium rounded ${outcomeColors[interview.outcome] || ''}`}>
                  {interview.outcome}
                </span>
              ) : (
                <span className="text-sm text-[var(--color-text-muted)]">-</span>
              )}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
              {interview?.interviewer || '-'}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <button
                onClick={(e) => { e.stopPropagation(); handleRejectInterview(customer.id) }}
                disabled={actionLoading === customer.id}
                className="px-2 py-1 text-xs font-medium rounded border transition-colors text-[#EF4444] border-[rgba(239,68,68,0.3)] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === customer.id ? 'Rejecting...' : '\u2715 Reject'}
              </button>
            </td>
          </>
        )
      }
      case 'invited_to_enrol': {
        const invite = enrolInvitesByCustomer[customer.id]
        const inviteDate = invite?.sent_at ? new Date(invite.sent_at) : null
        const deadline = inviteDate ? new Date(inviteDate.getTime() + 7 * 24 * 60 * 60 * 1000) : null
        const isPastDeadline = deadline ? new Date() > deadline : false
        return (
          <>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
              {formatDate(invite?.sent_at)}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm">
              <div className="flex items-center gap-2">
                {deadline && (
                  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isPastDeadline ? 'bg-[#EF4444]' : 'bg-[#22C55E]'}`} />
                )}
                <span className={isPastDeadline ? 'text-[#EF4444]' : 'text-[var(--color-text-secondary)]'}>
                  {deadline ? formatDate(deadline.toISOString()) : '-'}
                </span>
              </div>
            </td>
            <td className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] max-w-[180px] truncate">
              {customer.linkedin_company || customer.company_domain || '-'}
            </td>
          </>
        )
      }
      case 'enrolled': {
        const payment = paymentsByCustomer[customer.id]
        return (
          <>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
              {formatDate(payment?.paid_at)}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-primary)] font-medium">
              {payment ? formatCurrency(payment.amount_cents, payment.currency) : '-'}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
              {payment?.product || '-'}
            </td>
          </>
        )
      }
      default:
        // Side statuses
        return (
          <>
            <td className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] max-w-[180px] truncate">
              {customer.linkedin_company || customer.company_domain || '-'}
            </td>
            <td className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] max-w-[180px] truncate">
              {customer.linkedin_title || '-'}
            </td>
          </>
        )
    }
  }

  function renderStageTable(stage: FunnelStatus, stageCustomers: Customer[], isSide = false) {
    const columns = renderStageColumns(stage)
    const baseColumns = ['Name', 'Email']

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className={`border-b ${isSide ? 'border-[var(--color-border-subtle)]' : 'border-[var(--color-border)]'}`}>
              {baseColumns.map(col => (
                <th key={col} className="px-4 py-2 text-left kith-label">{col}</th>
              ))}
              {columns.map(col => (
                <th key={col} className="px-4 py-2 text-left kith-label">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stageCustomers.map(customer => (
              <tr
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                className={`border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors cursor-pointer ${
                  isSide ? 'opacity-75' : ''
                }`}
              >
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-primary)]">
                  {customer.first_name} {customer.last_name}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                  {customer.email}
                </td>
                {renderCustomerCells(isSide ? stage : stage, customer)}
              </tr>
            ))}
            {stageCustomers.length === 0 && (
              <tr>
                <td colSpan={baseColumns.length + columns.length} className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
                  No customers at this stage
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  // Close modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedCustomer(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="space-y-6">
      {/* Customer detail modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          application={applicationsByCustomer[selectedCustomer.id]}
          interview={interviewsByCustomer[selectedCustomer.id]}
          interviewInvite={interviewInvitesByCustomer[selectedCustomer.id]}
          enrolInvite={enrolInvitesByCustomer[selectedCustomer.id]}
          payment={paymentsByCustomer[selectedCustomer.id]}
          booking={bookingsByCustomer[selectedCustomer.id]}
          reminderCount={reminderCountsByCustomer[selectedCustomer.id] || 0}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {STAGE_SECTIONS.map(({ stage, sideStatuses }) => {
        const stageCustomers = byStatus.get(stage) || []
        const sideGroups = sideStatuses
          .map(s => ({ status: s, customers: byStatus.get(s) || [] }))
          .filter(g => g.customers.length > 0)

        return (
          <div key={stage}>
            {/* Stage header */}
            <div className={`kith-card border-l-4 ${stageHeaderColors[stage] || ''}`}>
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {FUNNEL_LABELS[stage]}
                  </h3>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                    {stageCustomers.length}
                  </span>
                </div>
              </div>

              {/* Stage table */}
              {renderStageTable(stage, stageCustomers)}

              {/* Side status dropdowns */}
              {sideGroups.map(({ status, customers: sideCustomers }) => {
                const isExpanded = expandedSides.has(status)
                const sideColumns = ['Company', 'Title']

                return (
                  <div key={status} className="border-t border-[var(--color-border-subtle)]">
                    <button
                      onClick={() => toggleSide(status)}
                      className="w-full px-5 py-2.5 flex items-center justify-between hover:bg-[var(--color-surface)] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <svg
                          className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''} ${sideStatusColors[status] || ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span className={`text-sm font-medium ${sideStatusColors[status] || ''}`}>
                          {FUNNEL_LABELS[status]}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-surface)] text-[var(--color-text-muted)]">
                          {sideCustomers.length}
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="bg-[rgba(0,0,0,0.1)]">
                        <div className="overflow-x-auto">
                          <table className="min-w-full">
                            <thead>
                              <tr className="border-b border-[var(--color-border-subtle)]">
                                <th className="px-4 py-2 text-left kith-label">Name</th>
                                <th className="px-4 py-2 text-left kith-label">Email</th>
                                {sideColumns.map(col => (
                                  <th key={col} className="px-4 py-2 text-left kith-label">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sideCustomers.map(customer => (
                                <tr
                                  key={customer.id}
                                  onClick={() => setSelectedCustomer(customer)}
                                  className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.03)] transition-colors opacity-75 cursor-pointer"
                                >
                                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-primary)]">
                                    {customer.first_name} {customer.last_name}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                                    {customer.email}
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] max-w-[180px] truncate">
                                    {customer.linkedin_company || customer.company_domain || '-'}
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] max-w-[180px] truncate">
                                    {customer.linkedin_title || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
