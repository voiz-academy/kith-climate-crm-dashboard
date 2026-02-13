'use client'

import { useState } from 'react'
import { Customer, FunnelStatus, FUNNEL_LABELS, FUNNEL_STAGES, SIDE_STATUSES } from '@/lib/supabase'

interface FunnelStageDetailProps {
  customers: Customer[]
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
  no_show: 'bg-[rgba(217,119,6,0.15)] text-[#D97706] border-[rgba(217,119,6,0.3)]',
  offer_expired: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border-[rgba(232,230,227,0.1)]',
  not_invited: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border-[rgba(232,230,227,0.1)]',
}

export function FunnelStageDetail({ customers }: FunnelStageDetailProps) {
  const [selectedStage, setSelectedStage] = useState<FunnelStatus>('applied')

  const allStages = [...FUNNEL_STAGES, ...SIDE_STATUSES]
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
                    ? `${stageColors[stage]} font-medium`
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
              <th className="px-6 py-3 text-left kith-label">Company</th>
              <th className="px-6 py-3 text-left kith-label">Title</th>
              <th className="px-6 py-3 text-left kith-label">LinkedIn</th>
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
                <td className="px-6 py-3 whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
                  {customer.linkedin_company || customer.company_domain || '-'}
                </td>
                <td className="px-6 py-3 text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
                  {customer.linkedin_title || '-'}
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  {customer.linkedin_url ? (
                    <a
                      href={customer.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
                    >
                      View →
                    </a>
                  ) : (
                    <span className="text-sm text-[var(--color-text-muted)]">-</span>
                  )}
                </td>
              </tr>
            ))}
            {filteredCustomers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
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
