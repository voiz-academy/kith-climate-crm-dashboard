'use client'

import { useState, useMemo } from 'react'

// --- Types ---

export type LocationData = {
  location: string
  country: string
  leadCount: number
  professionals: number
  pivoters: number
}

export type CountryData = {
  country: string
  leadCount: number
  professionals: number
  pivoters: number
}

export type CustomerLocation = {
  customerId: string
  location: string | null
  country: string
  leadType: 'professional' | 'pivoter' | 'unknown'
  eventDates: string[]
}

type EventOption = {
  value: string
  label: string
}

type Props = {
  customerLocations: CustomerLocation[]
  eventOptions: EventOption[]
}

// --- Component ---

export function LocationsView({ customerLocations, eventOptions }: Props) {
  const [selectedEvent, setSelectedEvent] = useState('all')
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  // Filter customers by selected event
  const filteredCustomers = useMemo(() => {
    if (selectedEvent === 'all') return customerLocations
    return customerLocations.filter(c => c.eventDates.includes(selectedEvent))
  }, [customerLocations, selectedEvent])

  // Compute locations and countries from filtered customers
  const { locations, countries } = useMemo(() => {
    const locationMap = new Map<string, LocationData>()
    const countryMap = new Map<string, CountryData>()

    filteredCustomers.forEach(c => {
      if (!c.location) return

      const normalizedLocation = c.location.trim()
      const country = c.country

      // Location-level aggregation
      if (!locationMap.has(normalizedLocation)) {
        locationMap.set(normalizedLocation, {
          location: normalizedLocation,
          country,
          leadCount: 0,
          professionals: 0,
          pivoters: 0,
        })
      }
      const locData = locationMap.get(normalizedLocation)!
      locData.leadCount++
      if (c.leadType === 'professional') locData.professionals++
      if (c.leadType === 'pivoter') locData.pivoters++

      // Country-level aggregation
      if (!countryMap.has(country)) {
        countryMap.set(country, {
          country,
          leadCount: 0,
          professionals: 0,
          pivoters: 0,
        })
      }
      const countryData = countryMap.get(country)!
      countryData.leadCount++
      if (c.leadType === 'professional') countryData.professionals++
      if (c.leadType === 'pivoter') countryData.pivoters++
    })

    return {
      locations: Array.from(locationMap.values()).sort((a, b) => b.leadCount - a.leadCount),
      countries: Array.from(countryMap.values()).sort((a, b) => b.leadCount - a.leadCount),
    }
  }, [filteredCustomers])

  // Derived stats
  const totalLocations = locations.length
  const totalLeadsWithLocation = locations.reduce((sum, l) => sum + l.leadCount, 0)
  const totalCountries = countries.length

  // Top countries for cards
  const TOP_N = 12
  const topCountries = countries.slice(0, TOP_N)
  const otherCountries = countries.slice(TOP_N)
  const otherTotal = otherCountries.reduce((sum, c) => sum + c.leadCount, 0)

  // Country drill-down: filter locations
  const displayedLocations = selectedCountry
    ? locations.filter(l => l.country === selectedCountry)
    : locations

  const selectedCountryData = selectedCountry
    ? countries.find(c => c.country === selectedCountry) ?? null
    : null

  // Reset country filter when event changes
  const handleEventChange = (value: string) => {
    setSelectedEvent(value)
    setSelectedCountry(null)
  }

  return (
    <>
      {/* Header with event filter */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Locations
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {totalLeadsWithLocation} leads across {totalCountries} countries
          </p>
        </div>
        <div>
          <select
            value={selectedEvent}
            onChange={e => handleEventChange(e.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded px-3 py-2 text-sm"
          >
            {eventOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Country cards */}
      <div className="mb-8">
        <h2 className="kith-label mb-4">Countries</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {topCountries.map(c => (
            <button
              key={c.country}
              onClick={() =>
                setSelectedCountry(
                  selectedCountry === c.country ? null : c.country
                )
              }
              className={`kith-card p-4 text-left transition-all cursor-pointer ${
                selectedCountry === c.country
                  ? 'ring-2 ring-[#5B9A8B] ring-offset-1 ring-offset-[var(--color-bg)]'
                  : 'hover:ring-1 hover:ring-[var(--color-border)]'
              }`}
            >
              <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                {c.leadCount}
              </div>
              <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                {c.country}
              </div>
              <div className="flex gap-3 mt-2 text-xs">
                {c.professionals > 0 && (
                  <span className="text-[#5B9A8B]">{c.professionals} pro</span>
                )}
                {c.pivoters > 0 && (
                  <span className="text-[#6B8DD6]">{c.pivoters} piv</span>
                )}
              </div>
            </button>
          ))}
          {otherTotal > 0 && (
            <div className="kith-card p-4">
              <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                {otherTotal}
              </div>
              <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                Other ({otherCountries.length} countries)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Country tab bar (shown when a country is selected) */}
      {selectedCountry && (
        <div className="mb-6">
          <div className="flex items-center gap-1 border-b border-[var(--color-border)] overflow-x-auto">
            <button
              onClick={() => setSelectedCountry(null)}
              className="px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]"
            >
              All Countries
            </button>
            <button
              className="px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap border-[#5B9A8B] text-[#5B9A8B] font-medium"
            >
              {selectedCountry}
            </button>
          </div>

          {/* Country detail summary */}
          {selectedCountryData && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="kith-card p-4">
                <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {selectedCountryData.leadCount}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  Total Leads
                </div>
              </div>
              <div className="kith-card p-4">
                <div className="text-2xl font-semibold text-[#5B9A8B]">
                  {selectedCountryData.professionals}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  Professionals
                </div>
              </div>
              <div className="kith-card p-4">
                <div className="text-2xl font-semibold text-[#6B8DD6]">
                  {selectedCountryData.pivoters}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  Pivoters
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Locations detail table */}
      <div className="kith-card">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">
            {selectedCountry ? `Locations in ${selectedCountry}` : 'All Locations'}
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {displayedLocations.length} unique location{displayedLocations.length !== 1 ? 's' : ''}
            {selectedCountry && (
              <>
                {' '}&middot;{' '}
                <button
                  onClick={() => setSelectedCountry(null)}
                  className="text-[#5B9A8B] hover:underline"
                >
                  Clear filter
                </button>
              </>
            )}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-6 py-3 text-left kith-label">Location</th>
                {!selectedCountry && (
                  <th className="px-6 py-3 text-left kith-label">Country</th>
                )}
                <th className="px-6 py-3 text-left kith-label">Leads</th>
                <th className="px-6 py-3 text-left kith-label">Professionals</th>
                <th className="px-6 py-3 text-left kith-label">Pivoters</th>
              </tr>
            </thead>
            <tbody>
              {displayedLocations.map(loc => (
                <tr
                  key={loc.location}
                  className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm text-[var(--color-text-primary)]">
                      {loc.location}
                    </div>
                  </td>
                  {!selectedCountry && (
                    <td className="px-6 py-4">
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        {loc.country}
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full bg-[var(--color-surface)] text-sm font-medium text-[var(--color-text-secondary)]">
                      {loc.leadCount}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {loc.professionals > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full bg-[rgba(91,154,139,0.15)] text-sm font-medium text-[#5B9A8B]">
                        {loc.professionals}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {loc.pivoters > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full bg-[rgba(107,141,214,0.15)] text-sm font-medium text-[#6B8DD6]">
                        {loc.pivoters}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {displayedLocations.length === 0 && (
                <tr>
                  <td
                    colSpan={selectedCountry ? 4 : 5}
                    className="px-6 py-12 text-center text-[var(--color-text-muted)]"
                  >
                    No location data found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
