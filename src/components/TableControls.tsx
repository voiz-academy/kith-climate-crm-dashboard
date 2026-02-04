'use client'

import { getEventShortLabel } from '@/lib/supabase'

interface TableControlsProps {
  searchTerm: string
  setSearchTerm: (term: string) => void
  typeFilter: string[]
  toggleTypeFilter: (type: string) => void
  eventFilter: string
  setEventFilter: (event: string) => void
  eventDates: string[]
  companyFilter: string
  setCompanyFilter: (company: string) => void
  companies: string[]
  locationFilter: string
  setLocationFilter: (location: string) => void
  locations: string[]
  onExport: () => void
  totalCount: number
  filteredCount: number
}

const leadTypes = ['professional', 'pivoter', 'unknown'] as const

export function TableControls({
  searchTerm,
  setSearchTerm,
  typeFilter,
  toggleTypeFilter,
  eventFilter,
  setEventFilter,
  eventDates,
  companyFilter,
  setCompanyFilter,
  companies,
  locationFilter,
  setLocationFilter,
  locations,
  onExport,
  totalCount,
  filteredCount,
}: TableControlsProps) {
  return (
    <div className="space-y-4">
      {/* Top row: Search and Export */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search name, company, title, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[#5B9A8B] focus:outline-none transition-colors"
          />
        </div>
        <button
          onClick={onExport}
          className="px-4 py-2 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-card)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-4 items-start sm:items-center">
        {/* Type filters */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Type:</span>
          <div className="flex gap-1">
            {leadTypes.map((type) => (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  typeFilter.includes(type)
                    ? type === 'professional'
                      ? 'bg-[rgba(91,154,139,0.15)] border-[#5B9A8B] text-[#5B9A8B]'
                      : type === 'pivoter'
                      ? 'bg-[rgba(107,141,214,0.15)] border-[#6B8DD6] text-[#6B8DD6]'
                      : 'bg-[rgba(232,230,227,0.1)] border-[rgba(232,230,227,0.3)] text-[var(--color-text-secondary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Event filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Event:</span>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-3 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:border-[#5B9A8B] focus:outline-none"
          >
            <option value="">All Events</option>
            {eventDates.map((date) => (
              <option key={date} value={date}>
                {getEventShortLabel(date)}
              </option>
            ))}
          </select>
        </div>

        {/* Company filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Company:</span>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="px-3 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:border-[#5B9A8B] focus:outline-none max-w-[180px]"
          >
            <option value="">All Companies</option>
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </div>

        {/* Location filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Location:</span>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-3 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:border-[#5B9A8B] focus:outline-none max-w-[180px]"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Count display */}
        <div className="sm:ml-auto text-xs text-[var(--color-text-muted)]">
          Showing {filteredCount} of {totalCount} leads
        </div>
      </div>
    </div>
  )
}
