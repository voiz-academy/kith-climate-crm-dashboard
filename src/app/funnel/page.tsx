import { unstable_cache } from 'next/cache'
import {
  fetchAll, getSupabase, Customer, CohortApplication, Interview, InterviewBooking, Email, Payment,
  getCustomerCohortStatus,
  type CohortFilter
} from '@/lib/supabase'
import { Header } from '@/components/Header'
import { FunnelPageClient } from '@/components/FunnelPageClient'
import { PendingInterviewsButton } from '@/components/PendingInterviewsButton'
import { AddInterviewButton } from '@/components/AddInterviewButton'
import { SyncOutlookButton } from '@/components/SyncOutlookButton'
import { CohortSelector } from '@/components/CohortSelector'
import { MailingButton } from '@/components/MailingButton'

// Tight column projections — drop heavy JSONB / unused fields to keep the
// Worker response under Cloudflare's CPU/memory budget.
const CUSTOMER_COLUMNS = [
  'id', 'email', 'first_name', 'last_name', 'company_domain', 'lead_type',
  'funnel_status', 'cohort_statuses', 'enrichment_status',
  'linkedin_url', 'linkedin_title', 'linkedin_company', 'linkedin_headline',
  'linkedin_industry', 'linkedin_location',
  'enrollment_deadline', 'discord_status', 'notes',
  'created_at', 'updated_at',
].join(', ')

const EMAIL_COLUMNS = 'customer_id, email_type, direction, sent_at, cohort'
const PAYMENT_COLUMNS = 'customer_id, enrollee_customer_id, status, cohort, paid_at, created_at'
const APPLICATION_COLUMNS = 'id, customer_id, name, email, linkedin, role, background, ai_view, goals, budget_confirmed, cohort, status, utm_source, utm_medium, utm_campaign, created_at'
const INTERVIEW_COLUMNS = 'id, customer_id, interviewee_name, interviewee_email, booking_id, fathom_recording_id, fathom_recording_url, fathom_summary, interviewer_notes, outcome, outcome_reason, conducted_at, cohort, created_at, updated_at, activity_type, applicant_scoring, interviewer'
const BOOKING_COLUMNS = 'id, customer_id, calendly_event_uri, calendly_invitee_uri, scheduled_at, interviewee_name, interviewee_email, interviewer_name, interviewer_email, event_type, location_type, location_url, cancelled_at, cancel_reason, cohort, created_at, updated_at'

type EmailTemplateRow = {
  id: string
  name: string
  subject: string
  funnel_trigger: string | null
  is_active: 'active' | 'partial' | 'inactive'
}

type FunnelData = {
  customers: Customer[]
  applications: CohortApplication[]
  interviews: Interview[]
  bookings: InterviewBooking[]
  emails: Email[]
  payments: Payment[]
  pendingCount: number
  pendingInterviewsCount: number
  emailTemplates: EmailTemplateRow[]
  pendingEmailCount: number
}

async function fetchFunnelData(selectedCohort: CohortFilter): Promise<FunnelData> {
  const isFiltered = selectedCohort !== 'all'
  const client = getSupabase()

  // Wave 1 — everything that doesn't depend on knowing customer IDs first.
  const [
    customers,
    cohortTaggedBookings,
    cohortTaggedEmails,
    cohortTaggedPayments,
    pendingCountRes,
    pendingInterviewsRes,
    pendingEmailRes,
    templatesRes,
  ] = await Promise.all([
    fetchAll<Customer>('customers', {
      select: CUSTOMER_COLUMNS,
      applyFilters: isFiltered
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (q: any) => q.contains('cohort_statuses', { [selectedCohort]: {} })
        : undefined,
    }),
    fetchAll<InterviewBooking>('interviews_booked', {
      select: BOOKING_COLUMNS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyFilters: isFiltered ? (q: any) => q.eq('cohort', selectedCohort) : undefined,
    }),
    fetchAll<Email>('emails', {
      select: EMAIL_COLUMNS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyFilters: isFiltered ? (q: any) => q.eq('cohort', selectedCohort) : undefined,
    }),
    fetchAll<Payment>('payments', {
      select: PAYMENT_COLUMNS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyFilters: isFiltered ? (q: any) => q.eq('cohort', selectedCohort) : undefined,
    }),
    client.from('pending_funnel_changes').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('pending_interviews').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('pending_emails').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('email_templates').select('id, name, subject, funnel_trigger, is_active').order('name', { ascending: true }),
  ])

  // Wave 2 — applications and interviews are keyed by customer membership
  // (not cohort tag), so we filter them after the customer set is known.
  const customerIds = customers.map(c => c.id)

  let applications: CohortApplication[]
  let interviews: Interview[]

  if (isFiltered && customerIds.length === 0) {
    applications = []
    interviews = []
  } else if (isFiltered) {
    [applications, interviews] = await Promise.all([
      fetchAll<CohortApplication>('cohort_applications', {
        select: APPLICATION_COLUMNS,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applyFilters: (q: any) => q.in('customer_id', customerIds),
      }),
      fetchAll<Interview>('interviews', {
        select: INTERVIEW_COLUMNS,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applyFilters: (q: any) => q.in('customer_id', customerIds),
      }),
    ])
  } else {
    [applications, interviews] = await Promise.all([
      fetchAll<CohortApplication>('cohort_applications', { select: APPLICATION_COLUMNS }),
      fetchAll<Interview>('interviews', { select: INTERVIEW_COLUMNS }),
    ])
  }

  const statusOrder: Record<string, number> = { active: 0, partial: 1, inactive: 2 }
  const emailTemplates = ((templatesRes.data ?? []) as EmailTemplateRow[]).sort((a, b) => {
    const aDiff = statusOrder[a.is_active] ?? 9
    const bDiff = statusOrder[b.is_active] ?? 9
    if (aDiff !== bDiff) return aDiff - bDiff
    return a.name.localeCompare(b.name)
  })

  return {
    customers,
    applications,
    interviews,
    bookings: cohortTaggedBookings,
    emails: cohortTaggedEmails,
    payments: cohortTaggedPayments,
    pendingCount: pendingCountRes.count ?? 0,
    pendingInterviewsCount: pendingInterviewsRes.count ?? 0,
    emailTemplates,
    pendingEmailCount: pendingEmailRes.count ?? 0,
  }
}

// 30s cache keyed on cohort — mutation routes call revalidatePath('/funnel')
// for instant invalidation after writes.
const getFunnelData = (selectedCohort: CohortFilter) =>
  unstable_cache(
    () => fetchFunnelData(selectedCohort),
    ['funnel-data', selectedCohort],
    { revalidate: 30, tags: ['funnel'] },
  )()

export const revalidate = 30

type PageProps = {
  searchParams: Promise<{ cohort?: string }>
}

export default async function FunnelPage({ searchParams }: PageProps) {
  const params = await searchParams
  const selectedCohort = (params.cohort ?? 'May 18th 2026') as CohortFilter
  const isFiltered = selectedCohort !== 'all'

  const { customers, applications, interviews, bookings, emails, payments, pendingCount, pendingInterviewsCount, emailTemplates, pendingEmailCount } = await getFunnelData(selectedCohort)

  // When a specific cohort is selected, override funnel_status with the cohort-specific one.
  // The DB filter already restricted `customers` to those with this cohort, so no extra filter needed.
  const effectiveCustomers: Customer[] = isFiltered
    ? customers.map(c => ({ ...c, funnel_status: getCustomerCohortStatus(c, selectedCohort) }))
    : customers

  // Filter out 'registered' customers — only show those who have progressed
  const activeCustomers = effectiveCustomers.filter(c => c.funnel_status !== 'registered')

  // Build lookup maps by customer_id for enrichment
  const applicationsByCustomer = new Map<string, CohortApplication>()
  applications.forEach(a => {
    if (!a.customer_id) return
    const existing = applicationsByCustomer.get(a.customer_id)
    if (!existing || a.created_at > existing.created_at) {
      applicationsByCustomer.set(a.customer_id, a)
    }
  })

  const interviewsByCustomer = new Map<string, Interview>()
  interviews.forEach(i => {
    const existing = interviewsByCustomer.get(i.customer_id)
    if (!existing || i.created_at > existing.created_at) {
      interviewsByCustomer.set(i.customer_id, i)
    }
  })

  const interviewInvitesByCustomer = new Map<string, Email>()
  emails
    .filter(e => e.email_type === 'invite_to_interview' && e.direction === 'outbound')
    .forEach(e => {
      const existing = interviewInvitesByCustomer.get(e.customer_id)
      if (!existing || e.sent_at > existing.sent_at) {
        interviewInvitesByCustomer.set(e.customer_id, e)
      }
    })

  const enrolInvitesByCustomer = new Map<string, Email>()
  emails
    .filter(e => e.email_type === 'invite_to_enrol' && e.direction === 'outbound')
    .forEach(e => {
      const existing = enrolInvitesByCustomer.get(e.customer_id)
      if (!existing || e.sent_at > existing.sent_at) {
        enrolInvitesByCustomer.set(e.customer_id, e)
      }
    })

  const paymentsByCustomer = new Map<string, Payment>()
  payments
    .filter(p => p.status === 'succeeded')
    .forEach(p => {
      const custId = p.enrollee_customer_id || p.customer_id
      const existing = paymentsByCustomer.get(custId)
      if (!existing || (p.paid_at || p.created_at) > (existing.paid_at || existing.created_at)) {
        paymentsByCustomer.set(custId, p)
      }
    })

  const bookingsByCustomer = new Map<string, InterviewBooking>()
  bookings
    .filter(b => !b.cancelled_at)
    .forEach(b => {
      const existing = bookingsByCustomer.get(b.customer_id)
      if (!existing || b.created_at > existing.created_at) {
        bookingsByCustomer.set(b.customer_id, b)
      }
    })

  const reminderCountsByCustomer = new Map<string, number>()
  emails
    .filter(e => e.email_type === 'interview_reminder' && e.direction === 'outbound')
    .forEach(e => {
      reminderCountsByCustomer.set(e.customer_id, (reminderCountsByCustomer.get(e.customer_id) || 0) + 1)
    })

  // Serialize data for the metrics component (only the fields it needs)
  const metricsApplications = applications.map(a => ({ created_at: a.created_at }))
  const metricsBookings = bookings.map(b => ({
    created_at: b.created_at,
    cancelled_at: b.cancelled_at,
  }))
  const metricsInterviews = interviews.map(i => ({
    conducted_at: i.conducted_at,
    created_at: i.created_at,
  }))
  const metricsPayments = payments.map(p => ({
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
            <MailingButton templates={emailTemplates} pendingEmailCount={pendingEmailCount} pendingChangesCount={pendingCount} />
            {pendingInterviewsCount > 0 && (
              <PendingInterviewsButton count={pendingInterviewsCount} />
            )}
          </div>
        </div>

        {/* Time-filtered metrics + pipeline */}
        <FunnelPageClient
          selectedCohort={selectedCohort}
          metricsApplications={metricsApplications}
          metricsBookings={metricsBookings}
          metricsInterviews={metricsInterviews}
          metricsPayments={metricsPayments}
          customers={activeCustomers}
          applicationsByCustomer={Object.fromEntries(applicationsByCustomer)}
          interviewsByCustomer={Object.fromEntries(interviewsByCustomer)}
          interviewInvitesByCustomer={Object.fromEntries(interviewInvitesByCustomer)}
          enrolInvitesByCustomer={Object.fromEntries(enrolInvitesByCustomer)}
          paymentsByCustomer={Object.fromEntries(paymentsByCustomer)}
          bookingsByCustomer={Object.fromEntries(bookingsByCustomer)}
          reminderCountsByCustomer={Object.fromEntries(reminderCountsByCustomer)}
        />

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
