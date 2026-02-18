import { fetchAll, Customer, WorkshopRegistration, getEventLabel, getEventShortLabel, personalDomains } from '@/lib/supabase'
import { EventComparisonChart } from '@/components/EventComparisonChart'

type EventStats = {
  date: string
  label: string
  shortLabel: string
  eventName: string
  registered: number
  attended: number
  attendanceRate: number
  professionals: number
  pivoters: number
  unknown: number
  profRate: number
  pivRate: number
  corporateEmails: number
  newLeads: number
  returningLeads: number
  topCompanies: { name: string; count: number }[]
}

async function getEventComparisonData(): Promise<EventStats[]> {
  const leads = await fetchAll<Customer>('customers')
  const registrations = await fetchAll<WorkshopRegistration>('workshop_registrations')

  // Build lead lookup
  const leadMap = new Map<string, Customer>()
  leads.forEach((l: Customer) => leadMap.set(l.id, l))

  // Group registrations by event date
  const eventMap = new Map<string, {
    eventName: string
    registrations: WorkshopRegistration[]
  }>()

  registrations.forEach((reg: WorkshopRegistration) => {
    const date = reg.event_date
    if (!eventMap.has(date)) {
      eventMap.set(date, { eventName: reg.event_name, registrations: [] })
    }
    eventMap.get(date)!.registrations.push(reg)
  })

  // Track which leads appeared in earlier events (for new vs returning)
  const sortedDates = Array.from(eventMap.keys()).sort()
  const seenLeadIds = new Set<string>()

  const eventStats: EventStats[] = []

  for (const date of sortedDates) {
    const { eventName, registrations: regs } = eventMap.get(date)!

    const registered = regs.length
    const attended = regs.filter(r => r.attended).length

    // Get unique leads for this event
    const eventLeadIds = new Set(regs.map(r => r.customer_id))
    const eventLeads = Array.from(eventLeadIds)
      .map(id => leadMap.get(id))
      .filter(Boolean) as Customer[]

    const professionals = eventLeads.filter(l => l.lead_type === 'professional').length
    const pivoters = eventLeads.filter(l => l.lead_type === 'pivoter').length
    const unknown = eventLeads.filter(l => l.lead_type === 'unknown').length
    const total = eventLeads.length || 1

    const corporateEmails = eventLeads.filter(l =>
      l.company_domain && !personalDomains.has(l.company_domain)
    ).length

    // New vs returning
    let newLeads = 0
    let returningLeads = 0
    eventLeadIds.forEach(id => {
      if (seenLeadIds.has(id)) {
        returningLeads++
      } else {
        newLeads++
      }
    })

    // Track for next event
    eventLeadIds.forEach(id => seenLeadIds.add(id))

    // Top companies
    const companyCount = new Map<string, number>()
    eventLeads.forEach(l => {
      const company = l.linkedin_company
      if (company) {
        companyCount.set(company, (companyCount.get(company) || 0) + 1)
      }
    })
    const topCompanies = Array.from(companyCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    eventStats.push({
      date,
      label: getEventLabel(date),
      shortLabel: getEventShortLabel(date),
      eventName,
      registered,
      attended,
      attendanceRate: Math.round((attended / registered) * 100),
      professionals,
      pivoters,
      unknown,
      profRate: Math.round((professionals / total) * 100),
      pivRate: Math.round((pivoters / total) * 100),
      corporateEmails,
      newLeads,
      returningLeads,
      topCompanies,
    })
  }

  return eventStats
}

export const dynamic = 'force-dynamic'

export default async function EventComparisonPage() {
  const events = await getEventComparisonData()

  // Prepare chart data
  const chartData = events.map(e => ({
    event: e.shortLabel,
    registered: e.registered,
    attended: e.attended,
    professionals: e.professionals,
    pivoters: e.pivoters,
    unknown: e.unknown,
  }))

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          Event Comparison
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          Audience composition and growth across {events.length} workshops
        </p>
      </div>

      {/* Stacked comparison chart */}
      <div className="mb-8">
        <EventComparisonChart data={chartData} />
      </div>

      {/* Event cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {events.map((event) => (
          <div key={event.date} className="kith-card p-6">
            {/* Event header */}
            <div className="mb-4">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                {event.label}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {event.eventName}
              </p>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div>
                <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {event.registered}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">Registered</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-[#5B9A8B]">
                  {event.attended}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">Attended</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {event.attendanceRate}%
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">Show rate</div>
              </div>
            </div>

            {/* Audience mix bar */}
            <div className="mb-5">
              <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-1.5">
                <span>Audience Mix</span>
                <span>{event.profRate}% professional</span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-[var(--color-surface)]">
                {event.professionals > 0 && (
                  <div
                    className="bg-[#5B9A8B] transition-all"
                    style={{ width: `${event.profRate}%` }}
                  />
                )}
                {event.pivoters > 0 && (
                  <div
                    className="bg-[#6B8DD6] transition-all"
                    style={{ width: `${event.pivRate}%` }}
                  />
                )}
                {event.unknown > 0 && (
                  <div
                    className="bg-[rgba(232,230,227,0.1)] transition-all"
                    style={{ width: `${100 - event.profRate - event.pivRate}%` }}
                  />
                )}
              </div>
              <div className="flex gap-4 mt-1.5 text-xs">
                <span className="text-[#5B9A8B]">{event.professionals} prof</span>
                <span className="text-[#6B8DD6]">{event.pivoters} pivot</span>
                <span className="text-[var(--color-text-muted)]">{event.unknown} unknown</span>
              </div>
            </div>

            {/* New vs returning + corporate */}
            <div className="grid grid-cols-3 gap-4 mb-5 pt-4 border-t border-[var(--color-border-subtle)]">
              <div>
                <div className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {event.newLeads}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">New leads</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-[var(--color-text-secondary)]">
                  {event.returningLeads}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">Returning</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-[var(--color-text-secondary)]">
                  {event.corporateEmails}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">Corporate</div>
              </div>
            </div>

            {/* Top companies */}
            {event.topCompanies.length > 0 && (
              <div className="pt-4 border-t border-[var(--color-border-subtle)]">
                <div className="text-xs text-[var(--color-text-muted)] mb-2">Top Companies</div>
                <div className="flex flex-wrap gap-2">
                  {event.topCompanies.map((c) => (
                    <span
                      key={c.name}
                      className="px-2 py-1 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                    >
                      {c.name} ({c.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
