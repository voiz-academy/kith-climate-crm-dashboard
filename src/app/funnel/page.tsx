import {
  fetchAll, Customer, CohortApplication,
  FUNNEL_STAGES, SIDE_STATUSES, FUNNEL_LABELS,
  type FunnelStatus
} from '@/lib/supabase'
import { Header } from '@/components/Header'
import { StatCard } from '@/components/StatCard'
import { FunnelChart } from '@/components/FunnelChart'
import { FunnelStageDetail } from '@/components/FunnelStageDetail'

async function getFunnelData() {
  const customers = await fetchAll<Customer>('customers')
  const applications = await fetchAll<CohortApplication>('cohort_applications')
  return { customers, applications }
}

export const dynamic = 'force-dynamic'

export default async function FunnelPage() {
  const { customers, applications } = await getFunnelData()

  // Count by funnel stage
  const stageCounts = new Map<FunnelStatus, number>()
  ;[...FUNNEL_STAGES, ...SIDE_STATUSES].forEach(s => stageCounts.set(s, 0))
  customers.forEach(c => {
    stageCounts.set(c.funnel_status, (stageCounts.get(c.funnel_status) || 0) + 1)
  })

  // Summary stats
  const totalCustomers = customers.length
  const totalApplicants = stageCounts.get('applied') || 0
  const totalEnrolled = stageCounts.get('enrolled') || 0
  const conversionRate = totalCustomers > 0
    ? ((totalApplicants / totalCustomers) * 100).toFixed(1)
    : '0'

  // Application overlap stat
  const applicantsWithWorkshops = applications.filter(a => {
    const customer = customers.find(c => c.id === a.customer_id)
    return customer && customer.lead_type !== 'unknown'
  }).length

  // Chart data
  const funnelData = FUNNEL_STAGES.map(stage => ({
    stage,
    count: stageCounts.get(stage) || 0,
    percentage: totalCustomers > 0
      ? Math.round(((stageCounts.get(stage) || 0) / totalCustomers) * 100)
      : 0,
  }))

  const sideData = SIDE_STATUSES.map(stage => ({
    stage,
    count: stageCounts.get(stage) || 0,
  }))

  // UTM breakdown from applications
  const utmSources = new Map<string, number>()
  applications.forEach(a => {
    const source = a.utm_source || 'Direct'
    utmSources.set(source, (utmSources.get(source) || 0) + 1)
  })
  const topSources = Array.from(utmSources.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="min-h-screen">
      <Header />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Customer Funnel
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Track customers through the Kith Climate enrolment pipeline
          </p>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Customers"
            value={totalCustomers}
            subtitle={`Across all funnel stages`}
          />
          <StatCard
            title="Applicants"
            value={totalApplicants}
            subtitle={`${conversionRate}% of registered`}
            accent
          />
          <StatCard
            title="Applications"
            value={applications.length}
            subtitle={`${applicantsWithWorkshops} also attended workshops`}
          />
          <StatCard
            title="Enrolled"
            value={totalEnrolled}
            subtitle={totalApplicants > 0
              ? `${((totalEnrolled / totalApplicants) * 100).toFixed(0)}% of applicants`
              : 'No enrolments yet'
            }
          />
        </div>

        {/* Funnel chart */}
        <div className="mb-8">
          <FunnelChart data={funnelData} sideData={sideData} />
        </div>

        {/* Application insights */}
        {applications.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* UTM sources */}
            <div className="kith-card p-6">
              <h3 className="kith-label mb-4">Application Sources</h3>
              <div className="space-y-3">
                {topSources.map(([source, count]) => {
                  const pct = Math.round((count / applications.length) * 100)
                  return (
                    <div key={source}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-[var(--color-text-secondary)]">{source}</span>
                        <span className="text-[var(--color-text-muted)]">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--color-surface)] overflow-hidden">
                        <div
                          className="h-full bg-[#5B9A8B] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Funnel stage breakdown */}
            <div className="kith-card p-6">
              <h3 className="kith-label mb-4">Stage Breakdown</h3>
              <div className="space-y-2">
                {FUNNEL_STAGES.map((stage) => {
                  const count = stageCounts.get(stage) || 0
                  const pct = totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0
                  return (
                    <div key={stage} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {FUNNEL_LABELS[stage]}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 rounded-full bg-[var(--color-surface)] overflow-hidden">
                          <div
                            className="h-full bg-[#5B9A8B] rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-[var(--color-text-primary)] w-12 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Stage detail table */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Customers by Stage
            </h2>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Click a stage to view customers
            </p>
          </div>
          <FunnelStageDetail customers={customers} />
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
