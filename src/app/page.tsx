import Image from 'next/image'
import { supabase, WorkshopLead, WorkshopRegistration, getEventShortLabel } from '@/lib/supabase'
import { StatCard } from '@/components/StatCard'
import { SegmentChart } from '@/components/SegmentChart'
import { EventChart } from '@/components/EventChart'
import { LeadTable } from '@/components/LeadTable'
import { Navigation } from '@/components/Navigation'

async function getDashboardData() {
  // Fetch all leads
  const { data: leads, error: leadsError } = await supabase
    .from('workshop_leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (leadsError) {
    console.error('Error fetching leads:', leadsError)
    return { leads: [], registrations: [] }
  }

  // Fetch all registrations
  const { data: registrations, error: regsError } = await supabase
    .from('workshop_registrations')
    .select('*')

  if (regsError) {
    console.error('Error fetching registrations:', regsError)
    return { leads: leads || [], registrations: [] }
  }

  return { leads: leads || [], registrations: registrations || [] }
}

export const revalidate = 60 // Revalidate every 60 seconds

export default async function Dashboard() {
  const { leads, registrations } = await getDashboardData()

  // Calculate stats
  const totalLeads = leads.length
  const withLinkedIn = leads.filter((l: WorkshopLead) => l.linkedin_url).length
  const professionals = leads.filter((l: WorkshopLead) => l.lead_type === 'professional').length
  const pivoters = leads.filter((l: WorkshopLead) => l.lead_type === 'pivoter').length
  const unknown = leads.filter((l: WorkshopLead) => l.lead_type === 'unknown').length

  // Corporate vs personal emails
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'proton.me', 'protonmail.com', 'aol.com', 'me.com']
  const corporateEmails = leads.filter((l: WorkshopLead) => l.company_domain && !personalDomains.includes(l.company_domain)).length

  // Segment data for pie chart - using Kith Climate brand colors
  const segmentData = [
    { name: 'Professional', value: professionals, color: '#5B9A8B' },  // Teal
    { name: 'Pivoter', value: pivoters, color: '#6B8DD6' },  // Soft blue
    { name: 'Unknown', value: unknown, color: 'rgba(232, 230, 227, 0.25)' },  // Muted
  ]

  // Event attendance data
  const eventMap = new Map<string, { registered: number; attended: number }>()
  registrations.forEach((reg: WorkshopRegistration) => {
    const date = reg.event_date
    if (!eventMap.has(date)) {
      eventMap.set(date, { registered: 0, attended: 0 })
    }
    const stats = eventMap.get(date)!
    stats.registered++
    if (reg.attended) {
      stats.attended++
    }
  })

  const eventData = Array.from(eventMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({
      event: getEventShortLabel(date),
      registered: stats.registered,
      attended: stats.attended,
    }))

  // Build map of lead_id to attended dates
  const attendedDatesMap = new Map<string, string[]>()
  registrations.forEach((reg: WorkshopRegistration) => {
    if (reg.attended) {
      const dates = attendedDatesMap.get(reg.lead_id) || []
      dates.push(reg.event_date)
      attendedDatesMap.set(reg.lead_id, dates)
    }
  })

  // Get leads with LinkedIn data for the table, enriched with attended dates
  const enrichedLeads = leads
    .filter((l: WorkshopLead) => l.linkedin_url)
    .map((l: WorkshopLead) => ({
      ...l,
      attended_dates: attendedDatesMap.get(l.id) || []
    }))

  // Get unique event dates for filter dropdown
  const eventDates = Array.from(eventMap.keys()).sort()

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Image
                src="/kith-climate-wordmark.svg"
                alt="Kith Climate"
                width={140}
                height={32}
                priority
              />
              <div className="h-6 w-px bg-[var(--color-border)]" />
              <Navigation />
            </div>
            <div className="text-xs text-[var(--color-text-muted)] font-mono">
              {new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Leads"
            value={totalLeads}
            subtitle={`${corporateEmails} corporate emails`}
          />
          <StatCard
            title="LinkedIn Enriched"
            value={withLinkedIn}
            subtitle={`${totalLeads > 0 ? ((withLinkedIn / totalLeads) * 100).toFixed(0) : 0}% of total`}
          />
          <StatCard
            title="Professionals"
            value={professionals}
            subtitle="Climate industry roles"
            accent
          />
          <StatCard
            title="Pivoters"
            value={pivoters}
            subtitle="Career transitioners"
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <SegmentChart data={segmentData} title="Lead Segmentation" />
          <EventChart data={eventData} />
        </div>

        {/* Leads table */}
        <div className="kith-card">
          <div className="px-6 py-4 border-b border-[var(--color-border)]">
            <h3 className="text-base font-medium text-[var(--color-text-primary)]">
              Enriched Leads
            </h3>
            <p className="text-sm text-[var(--color-text-tertiary)]">
              {enrichedLeads.length} leads with LinkedIn data
            </p>
          </div>
          <LeadTable leads={enrichedLeads} eventDates={eventDates} />
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Part of Kith AI Lab
          </p>
        </footer>
      </main>
    </div>
  )
}
