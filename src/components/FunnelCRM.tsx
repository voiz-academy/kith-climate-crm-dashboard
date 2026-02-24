'use client'

import { useState } from 'react'
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
                onClick={() => handleRejectApplication(customer.id)}
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
                onClick={() => handleNoShow(customer.id)}
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
                onClick={() => handleRejectInterview(customer.id)}
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
    const baseColumns = ['Name', 'Email', 'Type']

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
                className={`border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors ${
                  isSide ? 'opacity-75' : ''
                }`}
              >
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-primary)]">
                  {customer.first_name} {customer.last_name}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                  {customer.email}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-medium rounded ${leadTypeColors[customer.lead_type]}`}>
                    {customer.lead_type}
                  </span>
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

  return (
    <div className="space-y-6">
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
                                <th className="px-4 py-2 text-left kith-label">Type</th>
                                {sideColumns.map(col => (
                                  <th key={col} className="px-4 py-2 text-left kith-label">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sideCustomers.map(customer => (
                                <tr
                                  key={customer.id}
                                  className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.03)] transition-colors opacity-75"
                                >
                                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-primary)]">
                                    {customer.first_name} {customer.last_name}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                                    {customer.email}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-medium rounded ${leadTypeColors[customer.lead_type]}`}>
                                      {customer.lead_type}
                                    </span>
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
