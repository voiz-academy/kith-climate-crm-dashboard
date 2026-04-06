import { getSupabase, PageView } from '@/lib/supabase'
import { Header } from '@/components/Header'
import { StatCard } from '@/components/StatCard'
import { TrafficChart } from '@/components/TrafficChart'
import { TrafficDateSelector } from '@/components/TrafficDateSelector'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 500

async function fetchPageViews(since?: Date): Promise<PageView[]> {
  const client = getSupabase()
  const allRows: PageView[] = []
  let from = 0

  while (true) {
    let query = client.from('page_views').select('*').range(from, from + PAGE_SIZE - 1)
      .order('created_at', { ascending: true })

    if (since) {
      query = query.gte('created_at', since.toISOString())
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching page_views:', error)
      return allRows
    }
    if (!data || data.length === 0) break
    allRows.push(...(data as PageView[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return allRows
}

function parseReferrerDomain(referrer: string | null): string {
  if (!referrer || referrer.trim() === '') return 'Direct'
  try {
    const url = new URL(referrer)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return referrer
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type PageProps = {
  searchParams: Promise<{ range?: string }>
}

export default async function TrafficPage({ searchParams }: PageProps) {
  const params = await searchParams
  const range = params.range ?? '30'

  // Calculate the "since" date based on the range
  let since: Date | undefined
  let chartDays: number
  const now = new Date()

  if (range === 'all') {
    since = undefined
    chartDays = 0 // will be calculated from data
  } else {
    const days = parseInt(range, 10) || 30
    since = new Date(now)
    since.setDate(since.getDate() - days)
    chartDays = days
  }

  const pageViews = await fetchPageViews(since)

  // --- Stat cards ---
  const totalViews = pageViews.length
  const uniquePages = new Set(pageViews.map((pv) => pv.page_path)).size

  // Top referrer domain
  const referrerCounts = new Map<string, number>()
  pageViews.forEach((pv) => {
    const domain = parseReferrerDomain(pv.referrer)
    referrerCounts.set(domain, (referrerCounts.get(domain) || 0) + 1)
  })
  const topReferrer = Array.from(referrerCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]
  const topReferrerLabel = topReferrer ? topReferrer[0] : 'N/A'

  // UTM campaigns count
  const utmCampaigns = new Set(
    pageViews.filter((pv) => pv.utm_campaign).map((pv) => pv.utm_campaign)
  ).size

  // --- Views Over Time chart ---
  // For "all time", calculate days from earliest to latest
  if (range === 'all' && pageViews.length > 0) {
    const earliest = new Date(pageViews[0].created_at)
    chartDays = Math.ceil((now.getTime() - earliest.getTime()) / 86400000) + 1
    since = earliest
  }

  const chartStart = since ?? new Date(now.getTime() - 30 * 86400000)
  const dailyCounts = new Map<string, number>()
  for (let i = 0; i < chartDays; i++) {
    const d = new Date(chartStart)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    dailyCounts.set(key, 0)
  }

  pageViews.forEach((pv) => {
    const dayKey = pv.created_at.slice(0, 10)
    if (dailyCounts.has(dayKey)) {
      dailyCounts.set(dayKey, (dailyCounts.get(dayKey) || 0) + 1)
    }
  })

  const chartData = Array.from(dailyCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, views]) => ({
      date: formatDate(date),
      views,
    }))

  // --- Range label ---
  const rangeLabel = range === 'all' ? 'All time' : `Last ${range} days`

  // --- Top Pages ---
  const pageCounts = new Map<string, number>()
  pageViews.forEach((pv) => {
    pageCounts.set(pv.page_path, (pageCounts.get(pv.page_path) || 0) + 1)
  })
  const topPages = Array.from(pageCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // --- Referrer Sources ---
  const referrerSorted = Array.from(referrerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // --- UTM Breakdown ---
  const utmCombos = new Map<string, number>()
  pageViews.forEach((pv) => {
    if (pv.utm_source || pv.utm_medium || pv.utm_campaign) {
      const key = `${pv.utm_source || '(none)'}|||${pv.utm_medium || '(none)'}|||${pv.utm_campaign || '(none)'}`
      utmCombos.set(key, (utmCombos.get(key) || 0) + 1)
    }
  })
  const utmRows = Array.from(utmCombos.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const [source, medium, campaign] = key.split('|||')
      return { source, medium, campaign, count }
    })

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
              Website Traffic
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Page view analytics from kithclimate.com
            </p>
          </div>
          <TrafficDateSelector />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Page Views"
            value={totalViews.toLocaleString()}
            subtitle={rangeLabel}
          />
          <StatCard
            title="Unique Pages"
            value={uniquePages}
            subtitle="Distinct paths viewed"
          />
          <StatCard
            title="Top Referrer"
            value={topReferrerLabel}
            subtitle={topReferrer ? `${topReferrer[1].toLocaleString()} views` : ''}
            accent
          />
          <StatCard
            title="UTM Campaigns"
            value={utmCampaigns}
            subtitle="Distinct campaigns tracked"
          />
        </div>

        {/* Views Over Time chart */}
        <div className="mb-8">
          <TrafficChart data={chartData} />
        </div>

        {/* Tables grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Pages */}
          <div className="kith-card p-6">
            <h3 className="kith-label mb-4">Top Pages</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)]">
                    <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">
                      Path
                    </th>
                    <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">
                      Views
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map(([path, count]) => (
                    <tr
                      key={path}
                      className="border-b border-[var(--color-border-subtle)] last:border-0"
                    >
                      <td className="py-2 text-[var(--color-text-secondary)] font-mono text-xs truncate max-w-[300px]">
                        {path}
                      </td>
                      <td className="py-2 text-right text-[var(--color-text-primary)] font-medium">
                        {count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Referrer Sources */}
          <div className="kith-card p-6">
            <h3 className="kith-label mb-4">Referrer Sources</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)]">
                    <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">
                      Source
                    </th>
                    <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">
                      Views
                    </th>
                    <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {referrerSorted.map(([domain, count]) => {
                    const pct = totalViews > 0
                      ? ((count / totalViews) * 100).toFixed(1)
                      : '0'
                    return (
                      <tr
                        key={domain}
                        className="border-b border-[var(--color-border-subtle)] last:border-0"
                      >
                        <td className="py-2 text-[var(--color-text-secondary)]">
                          {domain}
                        </td>
                        <td className="py-2 text-right text-[var(--color-text-primary)] font-medium">
                          {count.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-[var(--color-text-muted)]">
                          {pct}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* UTM Breakdown */}
        {utmRows.length > 0 && (
          <div className="kith-card p-6 mb-8">
            <h3 className="kith-label mb-4">UTM Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)]">
                    <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">
                      Source
                    </th>
                    <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">
                      Medium
                    </th>
                    <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">
                      Campaign
                    </th>
                    <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">
                      Views
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {utmRows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--color-border-subtle)] last:border-0"
                    >
                      <td className="py-2 text-[var(--color-text-secondary)]">
                        {row.source}
                      </td>
                      <td className="py-2 text-[var(--color-text-secondary)]">
                        {row.medium}
                      </td>
                      <td className="py-2 text-[var(--color-text-secondary)]">
                        {row.campaign}
                      </td>
                      <td className="py-2 text-right text-[var(--color-text-primary)] font-medium">
                        {row.count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
