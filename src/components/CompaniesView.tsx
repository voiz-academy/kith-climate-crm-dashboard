'use client'

import { useState, useMemo } from 'react'
import { FunnelStatus, FUNNEL_LABELS } from '@/lib/supabase'

// ---------- Types ----------

type CompanyCustomer = {
  id: string
  name: string
  title: string | null
  lead_type: 'professional' | 'pivoter' | 'unknown'
  linkedin_url: string | null
  funnel_status: FunnelStatus
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

interface CompaniesViewProps {
  companies: CompanyData[]
  eventOptions: EventOption[]
}

// ---------- Style helpers ----------

const leadTypeColors: Record<string, string> = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

const FUNNEL_RANK: Record<string, number> = {
  registered: 1,
  applied: 2,
  application_rejected: 2,
  invited_to_interview: 3,
  booked: 4,
  interviewed: 5,
  no_show: 5,
  interview_rejected: 5,
  invited_to_enrol: 6,
  offer_expired: 6,
  enrolled: 7,
}

function funnelBadgeClasses(status: FunnelStatus): string {
  switch (status) {
    case 'registered':
      return 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]'
    case 'applied':
      return 'bg-[rgba(82,144,127,0.15)] text-[#52907F] border border-[rgba(82,144,127,0.3)]'
    case 'application_rejected':
    case 'interview_rejected':
      return 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)]'
    case 'invited_to_interview':
      return 'bg-[rgba(73,133,115,0.15)] text-[#498573] border border-[rgba(73,133,115,0.3)]'
    case 'booked':
      return 'bg-[rgba(64,122,103,0.15)] text-[#407A67] border border-[rgba(64,122,103,0.3)]'
    case 'interviewed':
      return 'bg-[rgba(55,111,91,0.15)] text-[#376F5B] border border-[rgba(55,111,91,0.3)]'
    case 'no_show':
      return 'bg-[rgba(217,119,6,0.15)] text-[#D97706] border border-[rgba(217,119,6,0.3)]'
    case 'invited_to_enrol':
      return 'bg-[rgba(46,100,79,0.15)] text-[#2E644F] border border-[rgba(46,100,79,0.3)]'
    case 'offer_expired':
    case 'not_invited':
      return 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]'
    case 'enrolled':
      return 'bg-[rgba(37,89,67,0.15)] text-[#255943] border border-[rgba(37,89,67,0.3)]'
    default:
      return 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]'
  }
}

// ---------- Component ----------

export function CompaniesView({ companies, eventOptions }: CompaniesViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<string>('all')
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)

  // Filter companies by selected event
  const filteredCompanies = useMemo(() => {
    if (selectedEvent === 'all') return companies

    return companies
      .map((company) => {
        // Only keep customers who have the selected event
        const matchingCustomers = company.customers.filter((c) =>
          c.events.some((e) => e.date === selectedEvent)
        )
        if (matchingCustomers.length === 0) return null

        const professionals = matchingCustomers.filter((c) => c.lead_type === 'professional').length
        const pivoters = matchingCustomers.filter((c) => c.lead_type === 'pivoter').length
        const totalAttendances = matchingCustomers.reduce(
          (sum, c) => sum + c.events.filter((e) => e.date === selectedEvent && e.attended).length,
          0
        )

        return {
          ...company,
          leadCount: matchingCustomers.length,
          professionals,
          pivoters,
          totalAttendances,
          customers: matchingCustomers,
        }
      })
      .filter(Boolean) as CompanyData[]
  }, [companies, selectedEvent])

  // Sort filtered companies by lead count descending
  const sortedCompanies = useMemo(() => {
    return [...filteredCompanies].sort((a, b) => b.leadCount - a.leadCount)
  }, [filteredCompanies])

  const totalCompanies = sortedCompanies.length
  const companiesWithMultiple = sortedCompanies.filter((c) => c.leadCount > 1).length

  function toggleExpanded(companyName: string) {
    setExpandedCompany((prev) => (prev === companyName ? null : companyName))
  }

  return (
    <>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Companies</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {totalCompanies} companies represented &bull; {companiesWithMultiple} with multiple
            attendees
          </p>
        </div>
        <div>
          <select
            value={selectedEvent}
            onChange={(e) => {
              setSelectedEvent(e.target.value)
              setExpandedCompany(null)
            }}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded px-3 py-2 text-sm"
          >
            <option value="all">All Events</option>
            {eventOptions.map((opt) => (
              <option key={opt.date} value={opt.date}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Companies list */}
      <div className="space-y-4">
        {sortedCompanies.map((company) => (
          <CompanyCard
            key={company.name}
            company={company}
            isExpanded={expandedCompany === company.name}
            onToggle={() => toggleExpanded(company.name)}
            selectedEvent={selectedEvent}
          />
        ))}
        {sortedCompanies.length === 0 && (
          <div className="kith-card p-12 text-center text-[var(--color-text-muted)]">
            No company data found
          </div>
        )}
      </div>
    </>
  )
}

// ---------- Company Card ----------

function CompanyCard({
  company,
  isExpanded,
  onToggle,
  selectedEvent,
}: {
  company: CompanyData
  isExpanded: boolean
  onToggle: () => void
  selectedEvent: string
}) {
  return (
    <div className="kith-card">
      <div
        className="p-4 cursor-pointer hover:bg-[rgba(91,154,139,0.03)] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                {company.name}
              </h3>
              <svg
                className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-[var(--color-text-secondary)]">
              <span>
                {company.leadCount} {company.leadCount === 1 ? 'lead' : 'leads'}
              </span>
              {company.professionals > 0 && (
                <span className="text-[#5B9A8B]">{company.professionals} professional</span>
              )}
              {company.pivoters > 0 && (
                <span className="text-[#6B8DD6]">{company.pivoters} pivoter</span>
              )}
              {company.totalAttendances > 0 && (
                <span>{company.totalAttendances} total attendances</span>
              )}
            </div>
          </div>
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-surface)] text-[var(--color-text-secondary)] text-lg font-semibold flex-shrink-0">
            {company.leadCount}
          </span>
        </div>
      </div>

      {/* Expanded customer detail */}
      {isExpanded && (
        <div className="border-t border-[var(--color-border-subtle)]">
          <div className="p-4 space-y-3">
            {company.customers.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                selectedEvent={selectedEvent}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Customer Row ----------

function CustomerRow({
  customer,
  selectedEvent,
}: {
  customer: CompanyCustomer
  selectedEvent: string
}) {
  const isBeyondRegistered = FUNNEL_RANK[customer.funnel_status] > FUNNEL_RANK['registered']

  // Determine which events to show
  const eventsToShow =
    selectedEvent === 'all'
      ? customer.events
      : customer.events.filter((e) => e.date === selectedEvent)

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 py-2 px-3 rounded bg-[rgba(232,230,227,0.02)] hover:bg-[rgba(91,154,139,0.03)] transition-colors">
      {/* Name + Title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {customer.linkedin_url ? (
            <a
              href={customer.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {customer.name}
            </a>
          ) : (
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {customer.name}
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 inline-flex text-[10px] leading-4 font-medium rounded ${
              leadTypeColors[customer.lead_type]
            }`}
          >
            {customer.lead_type}
          </span>
          {isBeyondRegistered && (
            <span
              className={`px-1.5 py-0.5 inline-flex text-[10px] leading-4 font-medium rounded ${funnelBadgeClasses(
                customer.funnel_status
              )}`}
            >
              {FUNNEL_LABELS[customer.funnel_status]}
            </span>
          )}
        </div>
        {customer.title && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{customer.title}</p>
        )}
      </div>

      {/* Event attendance labels */}
      <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
        {eventsToShow.map((event) => (
          <span
            key={event.date}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded ${
              event.attended
                ? 'bg-[rgba(34,197,94,0.1)] text-[#22C55E] border border-[rgba(34,197,94,0.2)]'
                : 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.4)] border border-[rgba(232,230,227,0.08)]'
            }`}
          >
            <span>{event.attended ? '\u2713' : '\u2717'}</span>
            <span>{event.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
