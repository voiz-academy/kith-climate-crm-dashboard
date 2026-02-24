'use client'

import { useState, useMemo } from 'react'
import { Customer, WorkshopRegistration, FUNNEL_LABELS, FunnelStatus, personalDomains as personalDomainsSet } from '@/lib/supabase'
import { Pagination } from './Pagination'

export type RegistrantRow = {
  customer: Customer
  registration: WorkshopRegistration
  isRepeat: boolean
}

interface EventRegistrantsTableProps {
  rows: RegistrantRow[]
  eventDate: string
}

const ITEMS_PER_PAGE = 25

const leadTypeColors: Record<string, string> = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

const funnelBadgeColor: Record<string, string> = {
  registered: '',
  applied: 'bg-[rgba(107,141,214,0.12)] text-[#6B8DD6] border border-[rgba(107,141,214,0.25)]',
  application_rejected: 'bg-[rgba(220,100,100,0.12)] text-[#dc6464] border border-[rgba(220,100,100,0.25)]',
  invited_to_interview: 'bg-[rgba(91,154,139,0.12)] text-[#5B9A8B] border border-[rgba(91,154,139,0.25)]',
  booked: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  interviewed: 'bg-[rgba(91,154,139,0.18)] text-[#5B9A8B] border border-[rgba(91,154,139,0.35)]',
  interview_rejected: 'bg-[rgba(220,100,100,0.12)] text-[#dc6464] border border-[rgba(220,100,100,0.25)]',
  invited_to_enrol: 'bg-[rgba(91,154,139,0.2)] text-[#5B9A8B] border border-[rgba(91,154,139,0.4)]',
  enrolled: 'bg-[rgba(91,154,139,0.25)] text-[#5B9A8B] border border-[rgba(91,154,139,0.5)] font-semibold',
  no_show: 'bg-[rgba(220,100,100,0.12)] text-[#dc6464] border border-[rgba(220,100,100,0.25)]',
  offer_expired: 'bg-[rgba(232,230,227,0.08)] text-[var(--color-text-muted)] border border-[rgba(232,230,227,0.15)]',
  not_invited: 'bg-[rgba(232,230,227,0.05)] text-[var(--color-text-muted)] border border-[rgba(232,230,227,0.1)]',
}

function getCompanyDisplay(customer: Customer): string {
  if (customer.linkedin_company) return customer.linkedin_company
  if (customer.company_domain && !personalDomainsSet.has(customer.company_domain)) {
    return customer.company_domain
  }
  return '-'
}

type SortField = 'name' | 'email' | 'title' | 'company' | 'lead_type' | 'location' | 'attended' | 'funnel_status'

export function EventRegistrantsTable({ rows, eventDate }: EventRegistrantsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortConfig, setSortConfig] = useState<{ field: SortField; ascending: boolean }>({
    field: 'name',
    ascending: true,
  })

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows
    const search = searchTerm.toLowerCase()
    return rows.filter(({ customer }) => {
      const name = `${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase()
      const email = (customer.email || '').toLowerCase()
      const company = getCompanyDisplay(customer).toLowerCase()
      return name.includes(search) || email.includes(search) || company.includes(search)
    })
  }, [rows, searchTerm])

  // Sort rows
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let aVal = ''
      let bVal = ''

      switch (sortConfig.field) {
        case 'name':
          aVal = `${a.customer.first_name || ''} ${a.customer.last_name || ''}`.toLowerCase()
          bVal = `${b.customer.first_name || ''} ${b.customer.last_name || ''}`.toLowerCase()
          break
        case 'email':
          aVal = (a.customer.email || '').toLowerCase()
          bVal = (b.customer.email || '').toLowerCase()
          break
        case 'title':
          aVal = (a.customer.linkedin_title || '').toLowerCase()
          bVal = (b.customer.linkedin_title || '').toLowerCase()
          break
        case 'company':
          aVal = getCompanyDisplay(a.customer).toLowerCase()
          bVal = getCompanyDisplay(b.customer).toLowerCase()
          break
        case 'lead_type':
          aVal = a.customer.lead_type
          bVal = b.customer.lead_type
          break
        case 'location':
          aVal = (a.customer.linkedin_location || '').toLowerCase()
          bVal = (b.customer.linkedin_location || '').toLowerCase()
          break
        case 'attended':
          aVal = a.registration.attended ? 'a' : 'z'
          bVal = b.registration.attended ? 'a' : 'z'
          break
        case 'funnel_status':
          aVal = a.customer.funnel_status
          bVal = b.customer.funnel_status
          break
      }

      const comparison = aVal.localeCompare(bVal)
      return sortConfig.ascending ? comparison : -comparison
    })
  }, [filteredRows, sortConfig])

  // Paginate
  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE)
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return sortedRows.slice(start, start + ITEMS_PER_PAGE)
  }, [sortedRows, currentPage])

  const handleSearchChange = (term: string) => {
    setSearchTerm(term)
    setCurrentPage(1)
  }

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      ascending: prev.field === field ? !prev.ascending : true,
    }))
  }

  const getSortIndicator = (field: SortField) => {
    if (sortConfig.field !== field) return null
    return sortConfig.ascending ? ' \u2191' : ' \u2193'
  }

  // Suppress the unused variable lint — eventDate is part of the public API for future use
  void eventDate

  return (
    <div>
      {/* Search bar */}
      <div className="px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by name, email, or company..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[#5B9A8B] focus:outline-none transition-colors"
            />
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            Showing {filteredRows.length} of {rows.length} registrants
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th
                onClick={() => handleSort('name')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Name{getSortIndicator('name')}
              </th>
              <th
                onClick={() => handleSort('email')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Email{getSortIndicator('email')}
              </th>
              <th
                onClick={() => handleSort('title')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Title{getSortIndicator('title')}
              </th>
              <th
                onClick={() => handleSort('company')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Company{getSortIndicator('company')}
              </th>
              <th
                onClick={() => handleSort('lead_type')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Type{getSortIndicator('lead_type')}
              </th>
              <th
                onClick={() => handleSort('location')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Location{getSortIndicator('location')}
              </th>
              <th
                onClick={() => handleSort('attended')}
                className="px-6 py-3 text-center kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Attended{getSortIndicator('attended')}
              </th>
              <th className="px-6 py-3 text-center kith-label select-none">
                Repeat?
              </th>
              <th
                onClick={() => handleSort('funnel_status')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Funnel{getSortIndicator('funnel_status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map(({ customer, registration, isRepeat }) => (
              <tr
                key={registration.id}
                className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors"
              >
                {/* Name */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {customer.linkedin_url ? (
                    <a
                      href={customer.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-[#5B9A8B] hover:underline"
                    >
                      {customer.first_name} {customer.last_name}
                    </a>
                  ) : (
                    <span className="text-sm text-[var(--color-text-tertiary)]">
                      {customer.first_name} {customer.last_name}
                    </span>
                  )}
                </td>

                {/* Email */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {customer.email}
                  </span>
                </td>

                {/* Title */}
                <td className="px-6 py-4">
                  <div className="text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
                    {customer.linkedin_title || '-'}
                  </div>
                </td>

                {/* Company */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[var(--color-text-secondary)]">
                    {getCompanyDisplay(customer)}
                  </div>
                </td>

                {/* Lead type */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded ${leadTypeColors[customer.lead_type]}`}>
                    {customer.lead_type}
                  </span>
                </td>

                {/* Location */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-tertiary)]">
                  {customer.linkedin_location || '-'}
                </td>

                {/* Attended */}
                <td className="px-6 py-4 text-center">
                  {registration.attended ? (
                    <span className="text-[#5B9A8B]" title="Attended">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  ) : (
                    <span className="text-[#dc6464]" title="Did not attend">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                  )}
                </td>

                {/* Repeat? */}
                <td className="px-6 py-4 text-center">
                  {isRepeat ? (
                    <span className="text-[#6B8DD6]" title="Registered for other events too">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">-</span>
                  )}
                </td>

                {/* Funnel status */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {customer.funnel_status !== 'registered' ? (
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 rounded ${funnelBadgeColor[customer.funnel_status] || ''}`}>
                      {FUNNEL_LABELS[customer.funnel_status as FunnelStatus] || customer.funnel_status}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {FUNNEL_LABELS.registered}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {paginatedRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                  No registrants match your search
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 pb-4">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  )
}
