import {
  fetchAll, getSupabase, Customer, DiscordMember,
  getCustomerCohortStatus,
  type CohortFilter
} from '@/lib/supabase'
import { Header } from '@/components/Header'
import { CommunityPageClient } from '@/components/CommunityPageClient'
import { SyncDiscordButton } from '@/components/SyncDiscordButton'

const CURRENT_COHORT = 'May 18th 2026'

async function getCommunityData() {
  const supabase = getSupabase()

  const [allCustomers, discordMembers] = await Promise.all([
    fetchAll<Customer>('customers'),
    fetchAll<DiscordMember>('discord_members', { orderBy: 'created_at', ascending: false }),
  ])

  // Filter to enrolled customers for the current cohort
  // Check both cohort-specific status AND global funnel_status to catch all enrolled
  const enrolledCustomers = allCustomers.filter(c => {
    const cohortStatus = getCustomerCohortStatus(c, CURRENT_COHORT as CohortFilter)
    return cohortStatus === 'enrolled' || c.funnel_status === 'enrolled'
  })

  // Fetch testimonials for the Testimonials tab
  const { data: testimonials, error: testError } = await supabase
    .from('testimonials')
    .select('*')
    .order('submitted_at', { ascending: false, nullsFirst: false })

  if (testError) {
    console.error('Failed to fetch testimonials:', testError)
  }

  return { enrolledCustomers, discordMembers, testimonials: testimonials ?? [] }
}

export const dynamic = 'force-dynamic'

export default async function CommunityPage() {
  const { enrolledCustomers, discordMembers, testimonials } = await getCommunityData()

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
              Community
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Discord onboarding and graduate testimonials
            </p>
          </div>
          <SyncDiscordButton />
        </div>

        <CommunityPageClient
          enrolledCustomers={enrolledCustomers}
          discordMembers={discordMembers}
          testimonials={testimonials}
        />

        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Part of Kith AI Lab
          </p>
        </footer>
      </main>
    </div>
  )
}
