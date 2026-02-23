'use client'

import { useState } from 'react'
import {
  Customer, CohortApplication, Interview, Email, Payment,
  FunnelStatus, FUNNEL_LABELS, SIDE_STATUSES,
} from '@/lib/supabase'

interface FunnelStageDetailProps {
  customers: Customer[]
  stages: FunnelStatus[]
  applicationsByCustomer: Record<string, CohortApplication>
  interviewsByCustomer: Record<string, Interview>
  interviewInvitesByCustomer: Record<string, Email>
  enrolInvitesByCustomer: Record<string, Email>
  paymentsByCustomer: Record<string, Payment>
}

const leadTypeColors: Record<string, string> = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

const stageColors: Record<string, string> = {
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

export function FunnelStageDetail({
  customers,
  stages,
  applicationsByCustomer,
  interviewsByCustomer,
  interviewInvitesByCustomer,
  enrolInvitesByCustomer,
  paymentsByCustomer,
}: FunnelStageDetailProps) {
  const [selectedStage, setSelectedStage] = useState<FunnelStatus>('applied')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  const allStages = [...stages, ...SIDE_STATUSES]
  const stageCounts = new Map<FunnelStatus, number>()
  allStages.forEach(s => stageCounts.set(s, 0))
  customers.forEach(c => {
    stageCounts.set(c.funnel_status, (stageCounts.get(c.funnel_status) || 0) + 1)
  })

  const filteredCustomers = customers.filter(c => c.funnel_status === selectedStage)

  return (
    <div className="kith-card">
      {/* Stage tabs */}
      <div className="px-6 py-4 border-b border-[var(--color-border)] overflow-x-auto">
        <div className="flex gap-2">
          {allStages.map((stage) => {
            const count = stageCounts.get(stage) || 0
            const isActive = stage === selectedStage
            return (
              <button
                key={stage}
                onClick={() => setSelectedStage(stage)}
                className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors border ${
                  isActive
                    ? `${stageColors[stage] || ''} font-medium`
                    : 'text-[var(--color-text-secondary)] border-transparent hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {FUNNEL_LABELS[stage]} <span className="opacity-60">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Customer list for selected stage */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-6 py-3 text-left kith-label">Name</th>
              <th className="px-6 py-3 text-left kith-label">Email</th>
              <th className="px-6 py-3 text-left kith-label">Type</th>
              {renderStageHeaders(selectedStage)}
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((customer) => (
              <tr
                key={customer.id}
                className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors"
              >
                <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-primary)]">
                  {customer.first_name} {customer.last_name}
                </td>
                <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                  {customer.email}
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded ${leadTypeColors[customer.lead_type]}`}>
                    {customer.lead_type}
                  </span>
                </td>
                {renderStageCells(
                  selectedStage,
                  customer,
                  applicationsByCustomer,
                  interviewsByCustomer,
                  interviewInvitesByCustomer,
                  enrolInvitesByCustomer,
                  paymentsByCustomer,
                )}
                {selectedStage === 'applied' && (
                  <td className="px-6 py-3 whitespace-nowrap">
                    <button
                      onClick={() => handleRejectApplication(customer.id)}
                      disabled={actionLoading === customer.id}
                      className="px-2 py-1 text-xs font-medium rounded border transition-colors text-[#EF4444] border-[rgba(239,68,68,0.3)] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === customer.id ? 'Rejecting...' : '\u2715 Reject'}
                    </button>
                  </td>
                )}
                {selectedStage === 'booked' && (
                  <td className="px-6 py-3 whitespace-nowrap">
                    <button
                      onClick={() => handleNoShow(customer.id)}
                      disabled={actionLoading === customer.id}
                      className="px-2 py-1 text-xs font-medium rounded border transition-colors text-[#D97706] border-[rgba(217,119,6,0.3)] hover:bg-[rgba(217,119,6,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === customer.id ? 'Updating...' : 'No Show'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filteredCustomers.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                  No customers at this stage
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Render extra column headers based on selected stage */
function renderStageHeaders(stage: FunnelStatus) {
  switch (stage) {
    case 'applied':
      return (
        <>
          <th className="px-6 py-3 text-left kith-label">Applied On</th>
          <th className="px-6 py-3 text-left kith-label">Role</th>
          <th className="px-6 py-3 text-left kith-label">UTM Source</th>
          <th className="px-6 py-3 text-left kith-label">Actions</th>
        </>
      )
    case 'invited_to_interview':
      return (
        <>
          <th className="px-6 py-3 text-left kith-label">Invite Sent</th>
          <th className="px-6 py-3 text-left kith-label">Company</th>
        </>
      )
    case 'interviewed':
      return (
        <>
          <th className="px-6 py-3 text-left kith-label">Interviewed On</th>
          <th className="px-6 py-3 text-left kith-label">Outcome</th>
          <th className="px-6 py-3 text-left kith-label">Interviewer</th>
        </>
      )
    case 'invited_to_enrol':
      return (
        <>
          <th className="px-6 py-3 text-left kith-label">Invite Sent</th>
          <th className="px-6 py-3 text-left kith-label">Company</th>
        </>
      )
    case 'enrolled':
      return (
        <>
          <th className="px-6 py-3 text-left kith-label">Paid On</th>
          <th className="px-6 py-3 text-left kith-label">Amount</th>
          <th className="px-6 py-3 text-left kith-label">Product</th>
        </>
      )
    case 'booked':
      return (
        <>
          <th className="px-6 py-3 text-left kith-label">Company</th>
          <th className="px-6 py-3 text-left kith-label">Title</th>
          <th className="px-6 py-3 text-left kith-label">Actions</th>
        </>
      )
    default:
      // Side statuses: show company + title as generic columns
      return (
        <>
          <th className="px-6 py-3 text-left kith-label">Company</th>
          <th className="px-6 py-3 text-left kith-label">Title</th>
        </>
      )
  }
}

const outcomeColors: Record<string, string> = {
  approved: 'bg-[rgba(34,197,94,0.15)] text-[#22C55E]',
  rejected: 'bg-[rgba(239,68,68,0.15)] text-[#EF4444]',
  waitlisted: 'bg-[rgba(234,179,8,0.15)] text-[#EAB308]',
  pending: 'bg-[rgba(232,230,227,0.08)] text-[rgba(232,230,227,0.5)]',
}

/** Render extra cell data based on selected stage */
function renderStageCells(
  stage: FunnelStatus,
  customer: Customer,
  applicationsByCustomer: Record<string, CohortApplication>,
  interviewsByCustomer: Record<string, Interview>,
  interviewInvitesByCustomer: Record<string, Email>,
  enrolInvitesByCustomer: Record<string, Email>,
  paymentsByCustomer: Record<string, Payment>,
) {
  switch (stage) {
    case 'applied': {
      const app = applicationsByCustomer[customer.id]
      return (
        <>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
            {formatDate(app?.created_at)}
          </td>
          <td className="px-6 py-3 text-sm text-[var(--color-text-secondary)] max-w-[200px] truncate">
            {app?.role || '-'}
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-muted)]">
            {app?.utm_source || 'Direct'}
          </td>
        </>
      )
    }
    case 'invited_to_interview': {
      const invite = interviewInvitesByCustomer[customer.id]
      return (
        <>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
            {formatDate(invite?.sent_at)}
          </td>
          <td className="px-6 py-3 text-sm text-[var(--color-text-secondary)] max-w-[200px] truncate">
            {customer.linkedin_company || customer.company_domain || '-'}
          </td>
        </>
      )
    }
    case 'interviewed': {
      const interview = interviewsByCustomer[customer.id]
      return (
        <>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
            {formatDate(interview?.conducted_at || interview?.created_at)}
          </td>
          <td className="px-6 py-3 whitespace-nowrap">
            {interview?.outcome ? (
              <span className={`px-2 py-1 text-xs font-medium rounded ${outcomeColors[interview.outcome] || ''}`}>
                {interview.outcome}
              </span>
            ) : (
              <span className="text-sm text-[var(--color-text-muted)]">-</span>
            )}
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
            {interview?.interviewer || '-'}
          </td>
        </>
      )
    }
    case 'invited_to_enrol': {
      const invite = enrolInvitesByCustomer[customer.id]
      return (
        <>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
            {formatDate(invite?.sent_at)}
          </td>
          <td className="px-6 py-3 text-sm text-[var(--color-text-secondary)] max-w-[200px] truncate">
            {customer.linkedin_company || customer.company_domain || '-'}
          </td>
        </>
      )
    }
    case 'enrolled': {
      const payment = paymentsByCustomer[customer.id]
      return (
        <>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
            {formatDate(payment?.paid_at)}
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-primary)] font-medium">
            {payment ? formatCurrency(payment.amount_cents, payment.currency) : '-'}
          </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
            {payment?.product || '-'}
          </td>
        </>
      )
    }
    case 'booked':
      return (
        <>
          <td className="px-6 py-3 text-sm text-[var(--color-text-secondary)] max-w-[200px] truncate">
            {customer.linkedin_company || customer.company_domain || '-'}
          </td>
          <td className="px-6 py-3 text-sm text-[var(--color-text-secondary)] max-w-[200px] truncate">
            {customer.linkedin_title || '-'}
          </td>
        </>
      )
    default:
      // Side statuses — show company + title
      return (
        <>
          <td className="px-6 py-3 text-sm text-[var(--color-text-secondary)] max-w-[200px] truncate">
            {customer.linkedin_company || customer.company_domain || '-'}
          </td>
          <td className="px-6 py-3 text-sm text-[var(--color-text-secondary)] max-w-[200px] truncate">
            {customer.linkedin_title || '-'}
          </td>
        </>
      )
  }
}
