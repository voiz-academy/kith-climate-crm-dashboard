import {
  fetchAll, getSupabase, Customer, DiscordMember,
  getCustomerCohortStatus,
  type CohortFilter
} from '@/lib/supabase'
import { Header } from '@/components/Header'
import { CommunityPageClient } from '@/components/CommunityPageClient'
import { SyncDiscordButton } from '@/components/SyncDiscordButton'

const MARCH_COHORT = 'March 16th 2026'

async function getCommunityData() {
  const [allCustomers, discordMembers] = await Promise.all([
    fetchAll<Customer>('customers'),
    fetchAll<DiscordMember>('discord_members', { orderBy: 'created_at', ascending: false }),
  ])

  // Filter to enrolled customers for the March 16th cohort
  const enrolledCustomers = allCustomers.filter(c => {
    const cohortStatus = getCustomerCohortStatus(c, MARCH_COHORT as CohortFilter)
    return cohortStatus === 'enrolled'
  })

  return { enrolledCustomers, discordMembers }
}

export const dynamic = 'force-dynamic'

export default async function CommunityPage() {
  const { enrolledCustomers, discordMembers } = await getCommunityData()

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
              Discord onboarding for the March 16th cohort
            </p>
          </div>
          <SyncDiscordButton />
        </div>

        <CommunityPageClient
          enrolledCustomers={enrolledCustomers}
          discordMembers={discordMembers}
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
