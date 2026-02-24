import { fetchAll, Customer, WorkshopRegistration } from '@/lib/supabase'
import { RepeatAttendeesTable } from '@/components/RepeatAttendeesTable'
import type { RepeatAttendee, EventRegistration } from '@/components/RepeatAttendeeDetailModal'

async function getRepeatAttendees(): Promise<RepeatAttendee[]> {
  const leads = await fetchAll<Customer>('customers')
  const registrations = await fetchAll<WorkshopRegistration>('workshop_registrations')

  // Build map of customer_id to attended dates (only attended=true)
  const attendedDatesMap = new Map<string, string[]>()
  // Build map of customer_id to all registrations
  const registrationsMap = new Map<string, EventRegistration[]>()

  registrations.forEach((reg: WorkshopRegistration) => {
    // Track all registrations for the modal
    const regs = registrationsMap.get(reg.customer_id) || []
    regs.push({
      event_name: reg.event_name,
      event_date: reg.event_date,
      attended: reg.attended,
      registration_date: reg.registration_date,
    })
    registrationsMap.set(reg.customer_id, regs)

    // Track attended dates for filtering
    if (reg.attended) {
      const dates = attendedDatesMap.get(reg.customer_id) || []
      dates.push(reg.event_date)
      attendedDatesMap.set(reg.customer_id, dates)
    }
  })

  // Filter to leads who attended 2+ workshops
  const repeatAttendees: RepeatAttendee[] = leads
    .map((l: Customer) => ({
      ...l,
      attended_dates: attendedDatesMap.get(l.id) || [],
      registrations: registrationsMap.get(l.id) || [],
    }))
    .filter(l => l.attended_dates.length >= 2)
    .sort((a, b) => b.attended_dates.length - a.attended_dates.length)

  return repeatAttendees
}

export const dynamic = 'force-dynamic'

export default async function RepeatAttendeesPage() {
  const repeatAttendees = await getRepeatAttendees()

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          Repeat Attendees
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          {repeatAttendees.length} people have attended 2+ workshops
        </p>
      </div>

      <RepeatAttendeesTable attendees={repeatAttendees} />
    </>
  )
}
