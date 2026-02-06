import Image from 'next/image'
import Link from 'next/link'
import { fetchAll, WorkshopLead } from '@/lib/supabase'
import { Navigation } from '@/components/Navigation'

type LocationData = {
  location: string
  leadCount: number
  professionals: number
  pivoters: number
}

async function getLocationsData(): Promise<LocationData[]> {
  const leads = await fetchAll<WorkshopLead>('workshop_leads')

  // Aggregate by location
  const locationMap = new Map<string, LocationData>()

  leads.forEach((lead: WorkshopLead) => {
    const location = lead.linkedin_location
    if (!location) return // Skip leads without location

    // Normalize location (take first part before comma for grouping)
    const normalizedLocation = location.trim()

    if (!locationMap.has(normalizedLocation)) {
      locationMap.set(normalizedLocation, {
        location: normalizedLocation,
        leadCount: 0,
        professionals: 0,
        pivoters: 0
      })
    }

    const data = locationMap.get(normalizedLocation)!
    data.leadCount++
    if (lead.lead_type === 'professional') data.professionals++
    if (lead.lead_type === 'pivoter') data.pivoters++
  })

  // Sort by lead count descending
  return Array.from(locationMap.values())
    .sort((a, b) => b.leadCount - a.leadCount)
}

export const revalidate = 60

export default async function LocationsPage() {
  const locations = await getLocationsData()

  const totalLocations = locations.length
  const totalLeadsWithLocation = locations.reduce((sum, l) => sum + l.leadCount, 0)

  // Group by region (rough heuristic based on common patterns)
  const getRegion = (location: string): string => {
    const loc = location.toLowerCase()
    if (loc.includes('california') || loc.includes('san francisco') || loc.includes('los angeles') || loc.includes('san diego') || loc.includes('bay area') || loc.includes(', ca')) {
      return 'California'
    }
    if (loc.includes('new york') || loc.includes('nyc') || loc.includes(', ny')) {
      return 'New York'
    }
    if (loc.includes('texas') || loc.includes('houston') || loc.includes('austin') || loc.includes('dallas') || loc.includes(', tx')) {
      return 'Texas'
    }
    if (loc.includes('united states') || loc.includes('usa') || /\b[A-Z]{2}\b/.test(location)) {
      return 'Other US'
    }
    if (loc.includes('london') || loc.includes('united kingdom') || loc.includes('uk')) {
      return 'United Kingdom'
    }
    if (loc.includes('canada') || loc.includes('toronto') || loc.includes('vancouver')) {
      return 'Canada'
    }
    return 'International'
  }

  // Calculate region stats
  const regionStats = new Map<string, number>()
  locations.forEach(l => {
    const region = getRegion(l.location)
    regionStats.set(region, (regionStats.get(region) || 0) + l.leadCount)
  })

  const sortedRegions = Array.from(regionStats.entries())
    .sort((a, b) => b[1] - a[1])

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
            Locations
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {totalLeadsWithLocation} leads across {totalLocations} locations
          </p>
        </div>

        {/* Region summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {sortedRegions.map(([region, count]) => (
            <div key={region} className="kith-card p-4 text-center">
              <div className="text-2xl font-semibold text-[var(--color-text-primary)]">
                {count}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">
                {region}
              </div>
            </div>
          ))}
        </div>

        {/* Locations table */}
        <div className="kith-card">
          <div className="px-6 py-4 border-b border-[var(--color-border)]">
            <h3 className="text-base font-medium text-[var(--color-text-primary)]">
              All Locations
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-6 py-3 text-left kith-label">Location</th>
                  <th className="px-6 py-3 text-left kith-label">Leads</th>
                  <th className="px-6 py-3 text-left kith-label">Professionals</th>
                  <th className="px-6 py-3 text-left kith-label">Pivoters</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr
                    key={loc.location}
                    className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm text-[var(--color-text-primary)]">
                        {loc.location}
                      </div>
                    </td>
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
                {locations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                      No location data found
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
