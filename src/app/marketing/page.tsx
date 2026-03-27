import { Header } from '@/components/Header'
import { MarketingCalendar } from '@/components/MarketingCalendar'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function getMarketingEvents() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('marketing_calendar')
    .select('*')
    .order('date', { ascending: true })

  if (error) {
    console.error('Failed to fetch marketing events:', error.message)
    return []
  }
  return data ?? []
}

export default async function MarketingPage() {
  const events = await getMarketingEvents()

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Marketing Calendar</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            10-week plan — March 23 to May 31, 2026
          </p>
        </div>

        <div className="kith-card p-4">
          <MarketingCalendar initialEvents={events} />
        </div>

        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Part of Kith AI Lab
          </p>
        </footer>
      </main>
    </div>
  )
}
