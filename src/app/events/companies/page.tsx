import { fetchAll, Customer, WorkshopRegistration, getEventLabel, personalDomains } from '@/lib/supabase'
import { CompaniesView } from '@/components/CompaniesView'

type CompanyCustomer = {
  id: string
  name: string
  title: string | null
  lead_type: 'professional' | 'pivoter' | 'unknown'
  linkedin_url: string | null
  funnel_status: Customer['funnel_status']
  events: Array<{ date: string; label: string; attended: boolean }>
}

type CompanyData = {
  name: string
  leadCount: number
  professionals: number
  pivoters: number
  totalAttendances: number
  customers: CompanyCustomer[]
}

type EventOption = {
  date: string
  label: string
}

async function getCompaniesData(): Promise<{ companies: CompanyData[]; eventOptions: EventOption[] }> {
  const leads = await fetchAll<Customer>('customers')
  const registrations = await fetchAll<WorkshopRegistration>('workshop_registrations')

  // Build map of customer_id to their event registrations
  const customerEventsMap = new Map<string, Array<{ date: string; label: string; attended: boolean }>>()
  const allEventDates = new Set<string>()

  registrations.forEach((reg: WorkshopRegistration) => {
    const date = reg.event_date
    allEventDates.add(date)

    if (!customerEventsMap.has(reg.customer_id)) {
      customerEventsMap.set(reg.customer_id, [])
    }
    customerEventsMap.get(reg.customer_id)!.push({
      date,
      label: getEventLabel(date),
      attended: reg.attended,
    })
  })

  // Sort each customer's events by date
  customerEventsMap.forEach((events) => {
    events.sort((a, b) => a.date.localeCompare(b.date))
  })

  // Build event options sorted chronologically
  const eventOptions: EventOption[] = Array.from(allEventDates)
    .sort()
    .map((date) => ({ date, label: getEventLabel(date) }))

  // Aggregate by company
  const companyMap = new Map<string, CompanyData>()

  leads.forEach((lead: Customer) => {
    // Get company name
    let company = lead.linkedin_company
    if (!company && lead.company_domain && !personalDomains.has(lead.company_domain)) {
      company = lead.company_domain
    }
    if (!company) return // Skip leads without company

    if (!companyMap.has(company)) {
      companyMap.set(company, {
        name: company,
        leadCount: 0,
        professionals: 0,
        pivoters: 0,
        totalAttendances: 0,
        customers: [],
      })
    }

    const data = companyMap.get(company)!
    data.leadCount++
    if (lead.lead_type === 'professional') data.professionals++
    if (lead.lead_type === 'pivoter') data.pivoters++

    const customerEvents = customerEventsMap.get(lead.id) || []
    const attendedCount = customerEvents.filter((e) => e.attended).length
    data.totalAttendances += attendedCount

    data.customers.push({
      id: lead.id,
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      title: lead.linkedin_title,
      lead_type: lead.lead_type,
      linkedin_url: lead.linkedin_url,
      funnel_status: lead.funnel_status,
      events: customerEvents,
    })
  })

  // Sort by lead count descending
  const companies = Array.from(companyMap.values()).sort((a, b) => b.leadCount - a.leadCount)

  return { companies, eventOptions }
}

export const dynamic = 'force-dynamic'

export default async function CompaniesPage() {
  const { companies, eventOptions } = await getCompaniesData()

  return <CompaniesView companies={companies} eventOptions={eventOptions} />
}
