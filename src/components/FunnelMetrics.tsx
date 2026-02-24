'use client'

import { useState, useMemo } from 'react'

interface FunnelMetricsProps {
  applications: { created_at: string }[]
  bookings: { created_at: string; cancelled_at: string | null }[]
  interviews: { conducted_at: string | null; created_at: string }[]
  payments: { paid_at: string | null; created_at: string; status: string }[]
}

type TimeRange = 'all' | '7d' | '30d' | '90d' | 'custom'

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function FunnelMetrics({ applications, bookings, interviews, payments }: FunnelMetricsProps) {
  const [range, setRange] = useState<TimeRange>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const cutoff = useMemo(() => {
    if (range === 'all') return null
    if (range === 'custom') {
      return customFrom ? startOfDay(new Date(customFrom)) : null
    }
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

  const conversionRate = appCount > 0
    ? `${((enrollmentCount / appCount) * 100).toFixed(0)}%`
    : '-'

  const presets: { label: string; value: TimeRange }[] = [
    { label: 'All Time', value: 'all' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
    { label: 'Custom', value: 'custom' },
  ]

  return (
    <div className="mb-8">
      {/* Time range selector */}
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

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="kith-card p-6">
          <h3 className="kith-label">Applications</h3>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">{appCount}</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {range === 'all' ? 'All time' : `In selected period`}
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
          <h3 className="kith-label">Enrollments</h3>
          <p className="mt-3 text-3xl font-semibold text-[#5B9A8B]">{enrollmentCount}</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {conversionRate} conversion{range !== 'all' ? ' in period' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
