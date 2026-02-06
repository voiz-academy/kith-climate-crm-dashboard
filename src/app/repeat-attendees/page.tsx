import Image from 'next/image'
import Link from 'next/link'
import { fetchAll, WorkshopLead, WorkshopRegistration } from '@/lib/supabase'
import { Navigation } from '@/components/Navigation'

async function getRepeatAttendees() {
  const leads = await fetchAll<WorkshopLead>('workshop_leads')
  const registrations = await fetchAll<WorkshopRegistration>('workshop_registrations')

  // Build map of lead_id to attended dates
  const attendedDatesMap = new Map<string, string[]>()
  registrations.forEach((reg: WorkshopRegistration) => {
    if (reg.attended) {
      const dates = attendedDatesMap.get(reg.lead_id) || []
      dates.push(reg.event_date)
      attendedDatesMap.set(reg.lead_id, dates)
    }
  })

  // Filter to leads who attended 2+ workshops
  const repeatAttendees = leads
    .map((l: WorkshopLead) => ({
      ...l,
      attended_dates: attendedDatesMap.get(l.id) || []
    }))
    .filter(l => l.attended_dates.length >= 2)
    .sort((a, b) => b.attended_dates.length - a.attended_dates.length)

  return repeatAttendees
}

const leadTypeColors = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

function formatAttendedDates(dates: string[]): string {
  return dates
    .sort()
    .map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    .join(', ')
}

export const revalidate = 60

export default async function RepeatAttendeesPage() {
  const repeatAttendees = await getRepeatAttendees()

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/">
                <Image
                  src="/kith-climate-wordmark.svg"
                  alt="Kith Climate"
                  width={140}
                  height={32}
                  priority
                />
              </Link>
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
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Repeat Attendees
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {repeatAttendees.length} people have attended 2+ workshops
          </p>
        </div>

        {/* Table */}
        <div className="kith-card">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-6 py-3 text-left kith-label">Name</th>
                  <th className="px-6 py-3 text-left kith-label">Title</th>
                  <th className="px-6 py-3 text-left kith-label">Type</th>
                  <th className="px-6 py-3 text-left kith-label">Company</th>
                  <th className="px-6 py-3 text-left kith-label"># Attended</th>
                  <th className="px-6 py-3 text-left kith-label">Dates</th>
                </tr>
              </thead>
              <tbody>
                {repeatAttendees.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {lead.linkedin_url ? (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
                        >
                          {lead.first_name} {lead.last_name}
                        </a>
                      ) : (
                        <span className="text-sm text-[var(--color-text-primary)]">
                          {lead.first_name} {lead.last_name}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
                        {lead.linkedin_title || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded ${leadTypeColors[lead.lead_type]}`}>
                        {lead.lead_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        {lead.linkedin_company || lead.company_domain || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] text-sm font-semibold">
                        {lead.attended_dates.length}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        {formatAttendedDates(lead.attended_dates)}
                      </div>
                    </td>
                  </tr>
                ))}
                {repeatAttendees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                      No repeat attendees found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
