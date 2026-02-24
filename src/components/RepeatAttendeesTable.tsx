'use client'

import { useState } from 'react'
import { RepeatAttendee, RepeatAttendeeDetailModal } from './RepeatAttendeeDetailModal'

interface RepeatAttendeesTableProps {
  attendees: RepeatAttendee[]
}

const leadTypeColors: Record<string, string> = {
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

export function RepeatAttendeesTable({ attendees }: RepeatAttendeesTableProps) {
  const [selectedAttendee, setSelectedAttendee] = useState<RepeatAttendee | null>(null)

  return (
    <>
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
              {attendees.map((attendee) => (
                <tr
                  key={attendee.id}
                  onClick={() => setSelectedAttendee(attendee)}
                  className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {attendee.first_name} {attendee.last_name}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
                      {attendee.linkedin_title || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded ${leadTypeColors[attendee.lead_type]}`}>
                      {attendee.lead_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[var(--color-text-secondary)]">
                      {attendee.linkedin_company || attendee.company_domain || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] text-sm font-semibold">
                      {attendee.attended_dates.length}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[var(--color-text-secondary)]">
                      {formatAttendedDates(attendee.attended_dates)}
                    </div>
                  </td>
                </tr>
              ))}
              {attendees.length === 0 && (
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

      {selectedAttendee && (
        <RepeatAttendeeDetailModal
          attendee={selectedAttendee}
          onClose={() => setSelectedAttendee(null)}
        />
      )}
    </>
  )
}
