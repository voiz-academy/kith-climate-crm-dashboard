'use client'

import { useState, useMemo } from 'react'
import { FunnelMetrics } from './FunnelMetrics'
import { FunnelCRM } from './FunnelCRM'
import {
  Customer, CohortApplication, Interview, InterviewBooking, Email, Payment,
} from '@/lib/supabase'

type TimeRange = 'all' | '7d' | '30d' | '90d' | 'custom'

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

interface FunnelPageClientProps {
  selectedCohort: string
  metricsApplications: { created_at: string }[]
  metricsBookings: { created_at: string; cancelled_at: string | null }[]
  metricsInterviews: { conducted_at: string | null; created_at: string }[]
  metricsPayments: { paid_at: string | null; created_at: string; status: string }[]
  customers: Customer[]
  applicationsByCustomer: Record<string, CohortApplication>
  interviewsByCustomer: Record<string, Interview>
  interviewInvitesByCustomer: Record<string, Email>
  enrolInvitesByCustomer: Record<string, Email>
  paymentsByCustomer: Record<string, Payment>
  bookingsByCustomer: Record<string, InterviewBooking>
  reminderCountsByCustomer: Record<string, number>
}

export function FunnelPageClient({
  selectedCohort,
  metricsApplications,
  metricsBookings,
  metricsInterviews,
  metricsPayments,
  customers,
  applicationsByCustomer,
  interviewsByCustomer,
  interviewInvitesByCustomer,
  enrolInvitesByCustomer,
  paymentsByCustomer,
  bookingsByCustomer,
  reminderCountsByCustomer,
}: FunnelPageClientProps) {
  const [range, setRange] = useState<TimeRange>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const cutoff = useMemo(() => {
    if (range === 'all') return null
    if (range === 'custom') return customFrom ? startOfDay(new Date(customFrom)) : null
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const d = new Date()
    d.setDate(d.getDate() - days)
    return startOfDay(d)
  }, [range, customFrom])

  const customEnd = useMemo(() => {
    if (range !== 'custom' || !customTo) return null
    const d = new Date(customTo)
    d.setDate(d.getDate() + 1) // end of day inclusive
    return d
  }, [range, customTo])

  const isFiltered = cutoff !== null || customEnd !== null

  // Filter customers for CRM view based on their application date
  const filteredCustomers = useMemo(() => {
    if (!isFiltered) return customers
    return customers.filter(c => {
      const app = applicationsByCustomer[c.id]
      const dateStr = app?.created_at || c.created_at
      if (!dateStr) return false
      const d = new Date(dateStr)
      if (cutoff && d < cutoff) return false
      if (customEnd && d >= customEnd) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, applicationsByCustomer, cutoff, customEnd])

  const presets: { label: string; value: TimeRange }[] = [
    { label: 'All Time', value: 'all' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
    { label: 'Custom', value: 'custom' },
  ]

  return (
    <>
      {/* Shared time range selector */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-sm text-[var(--color-text-tertiary)]">Time range:</span>
        <div className="flex gap-1">
          {presets.map(p => (
            <button
              key={p.value}
              onClick={() => setRange(p.value)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                range === p.value
                  ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)]"
            />
            <span className="text-sm text-[var(--color-text-muted)]">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)]"
            />
          </div>
        )}
      </div>

      {/* Time-filtered metrics */}
      <FunnelMetrics
        applications={metricsApplications}
        bookings={metricsBookings}
        interviews={metricsInterviews}
        payments={metricsPayments}
        cutoff={cutoff}
        customEnd={customEnd}
        range={range}
      />

      {/* CRM-style funnel stages */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Pipeline
          </h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {isFiltered
              ? `${filteredCustomers.length} customers from applications in selected period`
              : 'All customers by funnel stage'}
          </p>
        </div>
        <FunnelCRM
          selectedCohort={selectedCohort}
          customers={filteredCustomers}
          applicationsByCustomer={applicationsByCustomer}
          interviewsByCustomer={interviewsByCustomer}
          interviewInvitesByCustomer={interviewInvitesByCustomer}
          enrolInvitesByCustomer={enrolInvitesByCustomer}
          paymentsByCustomer={paymentsByCustomer}
          bookingsByCustomer={bookingsByCustomer}
          reminderCountsByCustomer={reminderCountsByCustomer}
        />
      </div>
    </>
  )
}
