'use client'

import { useState, useMemo } from 'react'
import { LeadWithAttendance } from '@/lib/supabase'
import { TableControls } from './TableControls'
import { Pagination } from './Pagination'
import { LeadDetailModal } from './LeadDetailModal'

interface LeadTableProps {
  leads: LeadWithAttendance[]
  eventDates: string[]
}

type SortField = 'first_name' | 'linkedin_title' | 'lead_type' | 'linkedin_company' | 'attended_dates' | 'linkedin_location'

const ITEMS_PER_PAGE = 25

function formatAttendedDates(dates: string[]): string {
  if (!dates || dates.length === 0) return '-'
  return dates
    .sort()
    .map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    .join(', ')
}

const leadTypeColors = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

import { personalDomains as personalDomainsSet } from '@/lib/supabase'

function getCompanyDisplay(lead: LeadWithAttendance): string {
  if (lead.linkedin_company) return lead.linkedin_company
  if (lead.company_domain && !personalDomainsSet.has(lead.company_domain)) {
    return lead.company_domain
  }
  return '-'
}

function exportToCSV(leads: LeadWithAttendance[]) {
  const headers = ['Name', 'Email', 'Type', 'Company', 'Title', 'Location', 'LinkedIn URL', 'Attended']
  const rows = leads.map(l => [
    `${l.first_name || ''} ${l.last_name || ''}`.trim(),
    l.email || '',
    l.lead_type || '',
    l.linkedin_company || l.company_domain || '',
    l.linkedin_title || '',
    l.linkedin_location || '',
    l.linkedin_url || '',
    l.attended_dates.join('; ')
  ])

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `kith-climate-leads-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function LeadTable({ leads, eventDates }: LeadTableProps) {
  // State
  const [sortConfig, setSortConfig] = useState<{ field: SortField; ascending: boolean }>({
    field: 'first_name',
    ascending: true
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [eventFilter, setEventFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedLead, setSelectedLead] = useState<LeadWithAttendance | null>(null)

  // Build unique company and location lists for filter dropdowns
  const companies = useMemo(() => {
    const set = new Set<string>()
    leads.forEach(lead => {
      const company = getCompanyDisplay(lead)
      if (company !== '-') set.add(company)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [leads])

  const locations = useMemo(() => {
    const set = new Set<string>()
    leads.forEach(lead => {
      if (lead.linkedin_location) set.add(lead.linkedin_location)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [leads])

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const searchFields = [
          lead.first_name,
          lead.last_name,
          lead.email,
          lead.linkedin_company,
          lead.company_domain,
          lead.linkedin_title,
        ].filter(Boolean).map(f => f!.toLowerCase())

        if (!searchFields.some(field => field.includes(search))) {
          return false
        }
      }

      // Type filter
      if (typeFilter.length > 0 && !typeFilter.includes(lead.lead_type)) {
        return false
      }

      // Event filter
      if (eventFilter && !lead.attended_dates.includes(eventFilter)) {
        return false
      }

      // Company filter
      if (companyFilter && getCompanyDisplay(lead) !== companyFilter) {
        return false
      }

      // Location filter
      if (locationFilter && lead.linkedin_location !== locationFilter) {
        return false
      }

      return true
    })
  }, [leads, searchTerm, typeFilter, eventFilter, companyFilter, locationFilter])

  // Sort leads
  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortConfig.field) {
        case 'first_name':
          aVal = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase()
          bVal = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase()
          break
        case 'linkedin_title':
          aVal = (a.linkedin_title || '').toLowerCase()
          bVal = (b.linkedin_title || '').toLowerCase()
          break
        case 'lead_type':
          aVal = a.lead_type
          bVal = b.lead_type
          break
        case 'linkedin_company':
          aVal = getCompanyDisplay(a).toLowerCase()
          bVal = getCompanyDisplay(b).toLowerCase()
          break
        case 'attended_dates':
          aVal = a.attended_dates.length
          bVal = b.attended_dates.length
          break
        case 'linkedin_location':
          aVal = (a.linkedin_location || '').toLowerCase()
          bVal = (b.linkedin_location || '').toLowerCase()
          break
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.ascending ? aVal - bVal : bVal - aVal
      }

      const comparison = String(aVal).localeCompare(String(bVal))
      return sortConfig.ascending ? comparison : -comparison
    })
  }, [filteredLeads, sortConfig])

  // Paginate leads
  const totalPages = Math.ceil(sortedLeads.length / ITEMS_PER_PAGE)
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return sortedLeads.slice(start, start + ITEMS_PER_PAGE)
  }, [sortedLeads, currentPage])

  // Reset to page 1 when filters change
  const handleSearchChange = (term: string) => {
    setSearchTerm(term)
    setCurrentPage(1)
  }

  const handleTypeFilterToggle = (type: string) => {
    setTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
    setCurrentPage(1)
  }

  const handleEventFilterChange = (event: string) => {
    setEventFilter(event)
    setCurrentPage(1)
  }

  const handleCompanyFilterChange = (company: string) => {
    setCompanyFilter(company)
    setCurrentPage(1)
  }

  const handleLocationFilterChange = (location: string) => {
    setLocationFilter(location)
    setCurrentPage(1)
  }

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      ascending: prev.field === field ? !prev.ascending : true
    }))
  }

  const getSortIndicator = (field: SortField) => {
    if (sortConfig.field !== field) return null
    return sortConfig.ascending ? ' ↑' : ' ↓'
  }

  return (
    <div>
      {/* Controls */}
      <div className="px-6 py-4 border-b border-[var(--color-border)]">
        <TableControls
          searchTerm={searchTerm}
          setSearchTerm={handleSearchChange}
          typeFilter={typeFilter}
          toggleTypeFilter={handleTypeFilterToggle}
          eventFilter={eventFilter}
          setEventFilter={handleEventFilterChange}
          eventDates={eventDates}
          companyFilter={companyFilter}
          setCompanyFilter={handleCompanyFilterChange}
          companies={companies}
          locationFilter={locationFilter}
          setLocationFilter={handleLocationFilterChange}
          locations={locations}
          onExport={() => exportToCSV(sortedLeads)}
          totalCount={leads.length}
          filteredCount={filteredLeads.length}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th
                onClick={() => handleSort('first_name')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Name{getSortIndicator('first_name')}
              </th>
              <th
                onClick={() => handleSort('linkedin_title')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Title{getSortIndicator('linkedin_title')}
              </th>
              <th
                onClick={() => handleSort('lead_type')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Type{getSortIndicator('lead_type')}
              </th>
              <th
                onClick={() => handleSort('linkedin_company')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Company{getSortIndicator('linkedin_company')}
              </th>
              <th
                onClick={() => handleSort('attended_dates')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Attended{getSortIndicator('attended_dates')}
              </th>
              <th
                onClick={() => handleSort('linkedin_location')}
                className="px-6 py-3 text-left kith-label cursor-pointer hover:text-[var(--color-text-primary)] transition-colors select-none"
              >
                Location{getSortIndicator('linkedin_location')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedLeads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  {lead.linkedin_url ? (
                    <span className="text-sm font-semibold text-[#5B9A8B]">
                      {lead.first_name} {lead.last_name}
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--color-text-tertiary)]">
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
                    {getCompanyDisplay(lead)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[var(--color-text-secondary)]">
                    {formatAttendedDates(lead.attended_dates)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-tertiary)]">
                  {lead.linkedin_location || '-'}
                </td>
              </tr>
            ))}
            {paginatedLeads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                  No leads match your filters
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

      {/* Modal */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </div>
  )
}
