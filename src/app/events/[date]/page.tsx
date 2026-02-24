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

  return { rows, eventName, totalCount: eventRegs.length }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  const { rows, eventName, totalCount } = await getEventRegistrants(date)
  const label = getEventLabel(date)

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

      {/* Registrants table */}
      <div className="kith-card overflow-hidden">
        <EventRegistrantsTable rows={rows} eventDate={date} />
      </div>
    </>
  )
}
