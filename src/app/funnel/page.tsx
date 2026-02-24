import {
  fetchAll, getSupabase, Customer, CohortApplication, Interview, InterviewBooking, Email, Payment,
  FUNNEL_LABELS, SIDE_STATUSES, getCustomerCohortStatus,
  type FunnelStatus, type CohortFilter
} from '@/lib/supabase'
import { Header } from '@/components/Header'
import { FunnelMetrics } from '@/components/FunnelMetrics'
import { FunnelCRM } from '@/components/FunnelCRM'
import { PendingChangesButton } from '@/components/PendingChangesButton'
import { PendingInterviewsButton } from '@/components/PendingInterviewsButton'
import { AddInterviewButton } from '@/components/AddInterviewButton'
import { SyncOutlookButton } from '@/components/SyncOutlookButton'
import { CohortSelector } from '@/components/CohortSelector'

async function getFunnelData() {
  const [customers, applications, interviews, bookings, emails, payments] = await Promise.all([
    fetchAll<Customer>('customers'),
    fetchAll<CohortApplication>('cohort_applications'),
    fetchAll<Interview>('interviews'),
    fetchAll<InterviewBooking>('interviews_booked'),
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

  // Count pending interview recordings awaiting review
  let pendingInterviewsCount = 0
  try {
    const { count, error } = await getSupabase()
      .from('pending_interviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (!error && count !== null) pendingInterviewsCount = count
  } catch {
    // Non-critical — if count fails, button just won't show
  }

  return { customers, applications, interviews, bookings, emails, payments, pendingCount, pendingInterviewsCount }
}

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ cohort?: string }>
}

export default async function FunnelPage({ searchParams }: PageProps) {
  const params = await searchParams
  const selectedCohort = (params.cohort ?? 'all') as CohortFilter
  const isFiltered = selectedCohort !== 'all'

  const { customers, applications, interviews, bookings, emails, payments, pendingCount, pendingInterviewsCount } = await getFunnelData()

  // When a specific cohort is selected, map customers to their cohort-specific status.
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
  const filteredBookings = isFiltered
    ? bookings.filter(b => b.cohort === selectedCohort)
    : bookings
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

  // Bookings by customer (most recent non-cancelled booking)
  const bookingsByCustomer = new Map<string, InterviewBooking>()
  filteredBookings
    .filter(b => !b.cancelled_at)
    .forEach(b => {
      const existing = bookingsByCustomer.get(b.customer_id)
      if (!existing || b.created_at > existing.created_at) {
        bookingsByCustomer.set(b.customer_id, b)
      }
    })

  // Interview reminder email counts by customer
  const reminderCountsByCustomer = new Map<string, number>()
  filteredEmails
    .filter(e => e.email_type === 'interview_reminder' && e.direction === 'outbound')
    .forEach(e => {
      reminderCountsByCustomer.set(e.customer_id, (reminderCountsByCustomer.get(e.customer_id) || 0) + 1)
    })

  // Serialize data for the metrics component (only the fields it needs)
  const metricsApplications = filteredApplications.map(a => ({ created_at: a.created_at }))
  const metricsBookings = filteredBookings.map(b => ({
    created_at: b.created_at,
    cancelled_at: b.cancelled_at,
  }))
  const metricsInterviews = filteredInterviews.map(i => ({
    conducted_at: i.conducted_at,
    created_at: i.created_at,
  }))
  const metricsPayments = filteredPayments.map(p => ({
    paid_at: p.paid_at,
    created_at: p.created_at,
    status: p.status,
  }))

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
            <SyncOutlookButton />
            <AddInterviewButton />
            {pendingInterviewsCount > 0 && (
              <PendingInterviewsButton count={pendingInterviewsCount} />
            )}
            {pendingCount > 0 && (
              <PendingChangesButton count={pendingCount} />
            )}
          </div>
        </div>

        {/* Time-filtered metrics */}
        <FunnelMetrics
          applications={metricsApplications}
          bookings={metricsBookings}
          interviews={metricsInterviews}
          payments={metricsPayments}
        />

        {/* CRM-style funnel stages */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Pipeline
            </h2>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              All customers by funnel stage
            </p>
          </div>
          <FunnelCRM
            customers={activeCustomers}
            applicationsByCustomer={Object.fromEntries(applicationsByCustomer)}
            interviewsByCustomer={Object.fromEntries(interviewsByCustomer)}
            interviewInvitesByCustomer={Object.fromEntries(interviewInvitesByCustomer)}
            enrolInvitesByCustomer={Object.fromEntries(enrolInvitesByCustomer)}
            paymentsByCustomer={Object.fromEntries(paymentsByCustomer)}
            bookingsByCustomer={Object.fromEntries(bookingsByCustomer)}
            reminderCountsByCustomer={Object.fromEntries(reminderCountsByCustomer)}
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
