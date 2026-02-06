import { NextResponse } from 'next/server'
import { fetchAll, WorkshopLead, WorkshopRegistration } from '@/lib/supabase'

export const runtime = 'edge'

export async function GET() {
  // Fetch leads with LinkedIn data (paginated to bypass 1000-row limit)
  const allLeads = await fetchAll<WorkshopLead>('workshop_leads', {
    orderBy: 'created_at', ascending: false
  })
  const leads = allLeads.filter(l => l.linkedin_url)

  // Fetch registrations for attendance mapping
  const registrations = await fetchAll<WorkshopRegistration>('workshop_registrations')

  // Build attended dates map
  const attendedDatesMap = new Map<string, string[]>()
  registrations.forEach((reg) => {
    if (reg.attended) {
      const dates = attendedDatesMap.get(reg.lead_id) || []
      dates.push(reg.event_date)
      attendedDatesMap.set(reg.lead_id, dates)
    }
  })

  // Enrich leads with attended dates
  const enrichedLeads = leads.map((l) => ({
    ...l,
    attended_dates: attendedDatesMap.get(l.id) || []
  }))

  return NextResponse.json(enrichedLeads, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
    }
  })
}
