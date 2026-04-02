'use client'

import { useMemo } from 'react'

interface FunnelMetricsProps {
  customerCount: number
  enrolledCount: number
  applications: { created_at: string }[]
  bookings: { created_at: string; cancelled_at: string | null }[]
  interviews: { conducted_at: string | null; created_at: string }[]
  payments: { paid_at: string | null; created_at: string; status: string }[]
  cutoff: Date | null
  customEnd: Date | null
  range: 'all' | '7d' | '30d' | '90d' | 'custom'
}

export function FunnelMetrics({ customerCount, enrolledCount, applications, bookings, interviews, payments, cutoff, customEnd, range }: FunnelMetricsProps) {

  function inRange(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false
    const d = new Date(dateStr)
    if (cutoff && d < cutoff) return false
    if (customEnd && d >= customEnd) return false
    return true
  }

  const appCount = useMemo(
    () => cutoff === null && !customEnd
      ? applications.length
      : applications.filter(a => inRange(a.created_at)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applications, cutoff, customEnd]
  )

  const bookingCount = useMemo(
    () => {
      const active = bookings.filter(b => !b.cancelled_at)
      return cutoff === null && !customEnd
        ? active.length
        : active.filter(b => inRange(b.created_at)).length
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, cutoff, customEnd]
  )

  const interviewCount = useMemo(
    () => cutoff === null && !customEnd
      ? interviews.length
      : interviews.filter(i => inRange(i.conducted_at || i.created_at)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interviews, cutoff, customEnd]
  )

  const enrollmentCount = useMemo(
    () => {
      const succeeded = payments.filter(p => p.status === 'succeeded')
      return cutoff === null && !customEnd
        ? succeeded.length
        : succeeded.filter(p => inRange(p.paid_at || p.created_at)).length
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, cutoff, customEnd]
  )

  const conversionRate = customerCount > 0
    ? `${((enrolledCount / customerCount) * 100).toFixed(0)}%`
    : '-'

  return (
    <div className="mb-8">
      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="kith-card p-6">
          <h3 className="kith-label">In Funnel</h3>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">{customerCount}</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Total customers
          </p>
        </div>
        <div className="kith-card p-6">
          <h3 className="kith-label">Interviews Booked</h3>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">{bookingCount}</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Active bookings{range !== 'all' ? ' in period' : ''}
          </p>
        </div>
        <div className="kith-card p-6">
          <h3 className="kith-label">Interviews</h3>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">{interviewCount}</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Conducted{range !== 'all' ? ' in period' : ''}
          </p>
        </div>
        <div className="kith-card p-6 border-[var(--color-border-hover)]">
          <h3 className="kith-label">Enrolled</h3>
          <p className="mt-3 text-3xl font-semibold text-[#5B9A8B]">{enrolledCount}</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {conversionRate} conversion
          </p>
        </div>
      </div>
    </div>
  )
}
