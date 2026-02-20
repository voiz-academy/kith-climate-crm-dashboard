import {
  fetchAll, getSupabase, Customer, CohortApplication, Interview, Email, Payment,
  FUNNEL_LABELS, SIDE_STATUSES, getCustomerCohortStatus,
  type FunnelStatus, type CohortFilter
} from '@/lib/supabase'
import { Header } from '@/components/Header'
import { StatCard } from '@/components/StatCard'
import { FunnelChart } from '@/components/FunnelChart'
import { FunnelStageDetail } from '@/components/FunnelStageDetail'
import { PendingChangesButton } from '@/components/PendingChangesButton'
import { AddInterviewButton } from '@/components/AddInterviewButton'
import { CohortSelector } from '@/components/CohortSelector'

/** The 5 funnel stages we display (no 'registered') */
const ACTIVE_FUNNEL_STAGES: FunnelStatus[] = [
  'applied',
  'invited_to_interview',
  'interviewed',
  'invited_to_enrol',
  'enrolled',
]

async function getFunnelData() {
  const [customers, applications, interviews, emails, payments] = await Promise.all([
    fetchAll<Customer>('customers'),
    fetchAll<CohortApplication>('cohort_applications'),
    fetchAll<Interview>('interviews'),
    fetchAll<Email>('emails'),
    fetchAll<Payment>('payments'),
  ])

  // Count pending funnel changes (head-only query for efficiency)
  let pendingCount = 0
  try {
    const { count, error } = await getSupabase()
      .from('pending_funnel_changes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (!error && count !== null) pendingCount = count
  } catch {
    // Non-critical — if count fails, button just won't show
  }

  return { customers, applications, interviews, emails, payments, pendingCount }
}

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ cohort?: string }>
}

export default async function FunnelPage({ searchParams }: PageProps) {
  const params = await searchParams
  const selectedCohort = (params.cohort ?? 'all') as CohortFilter
  const isFiltered = selectedCohort !== 'all'

  const { customers, applications, interviews, emails, payments, pendingCount } = await getFunnelData()

  // When a specific cohort is selected, map customers to their cohort-specific status.
  // Customers without a cohort_statuses entry for this cohort are excluded (they
  // aren't part of this cohort). When 'all', use funnel_status as-is.
  let effectiveCustomers: Customer[]

  if (isFiltered) {
    effectiveCustomers = customers
      .filter(c => c.cohort_statuses?.[selectedCohort] != null)
      .map(c => ({
        ...c,
        funnel_status: getCustomerCohortStatus(c, selectedCohort),
      }))
  } else {
    effectiveCustomers = customers
  }

  // Filter out 'registered' customers — only show those who have progressed
  const activeCustomers = effectiveCustomers.filter(c => c.funnel_status !== 'registered')

  // Filter child data by cohort when a specific cohort is selected
  const filteredApplications = isFiltered
    ? applications.filter(a => a.cohort === selectedCohort)
    : applications
  const filteredInterviews = isFiltered
    ? interviews.filter(i => i.cohort === selectedCohort)
    : interviews
  const filteredEmails = isFiltered
    ? emails.filter(e => e.cohort === selectedCohort)
    : emails
  const filteredPayments = isFiltered
    ? payments.filter(p => p.cohort === selectedCohort)
    : payments

  // Build lookup maps by customer_id for enrichment
  const applicationsByCustomer = new Map<string, CohortApplication>()
  filteredApplications.forEach(a => {
    if (!a.customer_id) return
    // Keep the latest application per customer
    const existing = applicationsByCustomer.get(a.customer_id)
    if (!existing || a.created_at > existing.created_at) {
      applicationsByCustomer.set(a.customer_id, a)
    }
  })

  const interviewsByCustomer = new Map<string, Interview>()
  filteredInterviews.forEach(i => {
    const existing = interviewsByCustomer.get(i.customer_id)
    if (!existing || i.created_at > existing.created_at) {
      interviewsByCustomer.set(i.customer_id, i)
    }
  })

  // Invite-to-interview emails (outbound, email_type = 'invite_to_interview')
  const interviewInvitesByCustomer = new Map<string, Email>()
  filteredEmails
    .filter(e => e.email_type === 'invite_to_interview' && e.direction === 'outbound')
    .forEach(e => {
      const existing = interviewInvitesByCustomer.get(e.customer_id)
      if (!existing || e.sent_at > existing.sent_at) {
        interviewInvitesByCustomer.set(e.customer_id, e)
      }
    })

  // Invite-to-enrol emails (outbound, email_type = 'invite_to_enrol')
  const enrolInvitesByCustomer = new Map<string, Email>()
  filteredEmails
    .filter(e => e.email_type === 'invite_to_enrol' && e.direction === 'outbound')
    .forEach(e => {
      const existing = enrolInvitesByCustomer.get(e.customer_id)
      if (!existing || e.sent_at > existing.sent_at) {
        enrolInvitesByCustomer.set(e.customer_id, e)
      }
    })

  const paymentsByCustomer = new Map<string, Payment>()
  filteredPayments
    .filter(p => p.status === 'succeeded')
    .forEach(p => {
      const custId = p.enrollee_customer_id || p.customer_id
      const existing = paymentsByCustomer.get(custId)
      if (!existing || (p.paid_at || p.created_at) > (existing.paid_at || existing.created_at)) {
        paymentsByCustomer.set(custId, p)
      }
    })

  // Count by funnel stage (active customers only)
  const stageCounts = new Map<FunnelStatus, number>()
  ;[...ACTIVE_FUNNEL_STAGES, ...SIDE_STATUSES].forEach(s => stageCounts.set(s, 0))
  activeCustomers.forEach(c => {
    stageCounts.set(c.funnel_status, (stageCounts.get(c.funnel_status) || 0) + 1)
  })

  // Summary stats
  const totalActive = activeCustomers.length
  const totalApplicants = stageCounts.get('applied') || 0
  const totalEnrolled = stageCounts.get('enrolled') || 0
  const totalInterviewed = (stageCounts.get('interviewed') || 0) +
    (stageCounts.get('invited_to_enrol') || 0) +
    (stageCounts.get('enrolled') || 0)

  // Application overlap stat
  const applicantsWithWorkshops = filteredApplications.filter(a => {
    const customer = customers.find(c => c.id === a.customer_id)
    return customer && customer.lead_type !== 'unknown'
  }).length

  // Chart data (only active stages)
  const funnelData = ACTIVE_FUNNEL_STAGES.map(stage => ({
    stage,
    count: stageCounts.get(stage) || 0,
    percentage: totalActive > 0
      ? Math.round(((stageCounts.get(stage) || 0) / totalActive) * 100)
      : 0,
  }))

  const sideData = SIDE_STATUSES.map(stage => ({
    stage,
    count: stageCounts.get(stage) || 0,
  }))

  // UTM breakdown from applications
  const utmSources = new Map<string, number>()
  filteredApplications.forEach(a => {
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
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
              Customer Funnel
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Track customers through the Kith Climate enrolment pipeline
            </p>
            <div className="mt-3">
              <CohortSelector />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AddInterviewButton />
            {pendingCount > 0 && (
              <PendingChangesButton count={pendingCount} />
            )}
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="In Pipeline"
            value={totalActive}
            subtitle="Customers past registration"
          />
          <StatCard
            title="Applicants"
            value={totalApplicants}
            subtitle={`${filteredApplications.length} total applications`}
            accent
          />
          <StatCard
            title="Interviewed"
            value={totalInterviewed}
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
        {filteredApplications.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* UTM sources */}
            <div className="kith-card p-6">
              <h3 className="kith-label mb-4">Application Sources</h3>
              <div className="space-y-3">
                {topSources.map(([source, count]) => {
                  const pct = Math.round((count / filteredApplications.length) * 100)
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
                {ACTIVE_FUNNEL_STAGES.map((stage) => {
                  const count = stageCounts.get(stage) || 0
                  const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0
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
          <FunnelStageDetail
            customers={activeCustomers}
            stages={ACTIVE_FUNNEL_STAGES}
            applicationsByCustomer={Object.fromEntries(applicationsByCustomer)}
            interviewsByCustomer={Object.fromEntries(interviewsByCustomer)}
            interviewInvitesByCustomer={Object.fromEntries(interviewInvitesByCustomer)}
            enrolInvitesByCustomer={Object.fromEntries(enrolInvitesByCustomer)}
            paymentsByCustomer={Object.fromEntries(paymentsByCustomer)}
          />
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
