import Link from 'next/link'
import { fetchAll, Customer, WorkshopRegistration, getEventLabel } from '@/lib/supabase'
import { EventRegistrantsTable, RegistrantRow } from '@/components/EventRegistrantsTable'

export const dynamic = 'force-dynamic'

async function getEventRegistrants(date: string) {
  const [customers, registrations] = await Promise.all([
    fetchAll<Customer>('customers'),
    fetchAll<WorkshopRegistration>('workshop_registrations'),
  ])

  // Build customer lookup
  const customerMap = new Map<string, Customer>()
  customers.forEach(c => customerMap.set(c.id, c))

  // Group registrations by customer to detect repeats
  const customerRegistrations = new Map<string, string[]>()
  registrations.forEach(reg => {
    const dates = customerRegistrations.get(reg.customer_id) || []
    dates.push(reg.event_date)
    customerRegistrations.set(reg.customer_id, dates)
  })

  // Filter to this event
  const eventRegs = registrations.filter(reg => reg.event_date === date)

  // Get the event name from the first registration (or use label)
  const eventName = eventRegs.length > 0 ? eventRegs[0].event_name : ''

  // Build rows
  const rows: RegistrantRow[] = []
  for (const reg of eventRegs) {
    const customer = customerMap.get(reg.customer_id)
    if (!customer) continue

    const allDates = customerRegistrations.get(reg.customer_id) || []
    const isRepeat = allDates.some(d => d !== date)

    rows.push({ customer, registration: reg, isRepeat })
  }

  // Compute UTM source breakdown
  const sourceBreakdown = new Map<string, number>()
  eventRegs.forEach(reg => {
    const src = reg.utm_source || '(no source)'
    sourceBreakdown.set(src, (sourceBreakdown.get(src) || 0) + 1)
  })
  const utmSources = Array.from(sourceBreakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, pct: Math.round((count / eventRegs.length) * 100) }))

  const trackedCount = eventRegs.filter(r => r.utm_source).length

  return { rows, eventName, totalCount: eventRegs.length, utmSources, trackedCount }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  const { rows, eventName, totalCount, utmSources, trackedCount } = await getEventRegistrants(date)
  const label = getEventLabel(date)
  const trackedPct = totalCount > 0 ? Math.round((trackedCount / totalCount) * 100) : 0

  return (
    <>
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[#5B9A8B] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Events
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          {label}
        </h1>
        {eventName && (
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {eventName}
          </p>
        )}
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {totalCount} registrant{totalCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Referral Sources Breakdown */}
      <div className="kith-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Referral Sources
          </h2>
          <span className="text-xs text-[var(--color-text-muted)]">
            {trackedCount} of {totalCount} tracked ({trackedPct}%)
          </span>
        </div>

        {/* Source bars */}
        <div className="space-y-3">
          {utmSources.map(({ name, count, pct }) => (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm ${name === '(no source)' ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-secondary)]'}`}>
                  {name}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                  {count} ({pct}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-surface)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${name === '(no source)' ? 'bg-[rgba(232,230,227,0.15)]' : 'bg-[#6B8DD6]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Visual summary bar */}
        {utmSources.length > 1 && (
          <div className="mt-5 pt-4 border-t border-[var(--color-border-subtle)]">
            <div className="text-xs text-[var(--color-text-muted)] mb-2">Distribution</div>
            <div className="flex h-4 rounded-full overflow-hidden bg-[var(--color-surface)]">
              {utmSources.filter(s => s.name !== '(no source)').map(({ name, pct }) => (
                <div
                  key={name}
                  className="bg-[#6B8DD6] border-r border-[var(--color-background)]"
                  style={{ width: `${pct}%`, minWidth: pct > 0 ? '2px' : '0' }}
                  title={`${name}: ${pct}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {utmSources.filter(s => s.name !== '(no source)').map(({ name, count }) => (
                <span key={name} className="text-xs text-[#6B8DD6]">
                  {name} ({count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Registrants table */}
      <div className="kith-card overflow-hidden">
        <EventRegistrantsTable rows={rows} eventDate={date} />
      </div>
    </>
  )
}
