import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Use non-NEXT_PUBLIC_ env vars (read at runtime on Cloudflare Workers)
// with NEXT_PUBLIC_ as fallback (inlined at build time by Next.js).
// This ensures the correct Supabase project is used regardless of which
// build pipeline produces the bundle.
function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
}

function getSupabaseKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any, any, any>

// Lazy singleton — created on first access so runtime env vars are available
let _supabase: AnySupabaseClient | null = null

export function getSupabase(): AnySupabaseClient {
  if (!_supabase) {
    const url = getSupabaseUrl()
    const key = getSupabaseKey()
    if (!url || !key) {
      throw new Error(`Supabase config missing: url=${url ? 'set' : 'MISSING'}, key=${key ? 'set' : 'MISSING'}`)
    }
    _supabase = createClient(url, key, {
      db: { schema: 'kith_climate' }
    })
  }
  return _supabase
}

/** @deprecated Use getSupabase() — kept for backwards compatibility */
export const supabase = new Proxy({} as AnySupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// Funnel status types and helpers
export type FunnelStatus =
  | 'registered'
  | 'applied'
  | 'application_rejected'
  | 'invited_to_interview'
  | 'booked'
  | 'interviewed'
  | 'interview_rejected'
  | 'invited_to_enrol'
  | 'enrolled'
  | 'no_show'
  | 'offer_expired'
  | 'not_invited'

export const FUNNEL_STAGES: FunnelStatus[] = [
  'registered', 'applied', 'invited_to_interview',
  'booked', 'interviewed', 'invited_to_enrol', 'enrolled'
]

export const SIDE_STATUSES: FunnelStatus[] = [
  'application_rejected', 'interview_rejected',
  'no_show', 'offer_expired', 'not_invited'
]

export const FUNNEL_LABELS: Record<FunnelStatus, string> = {
  registered: 'Registered',
  applied: 'Applied',
  application_rejected: 'Application Rejected',
  invited_to_interview: 'Invited to Interview',
  booked: 'Booked',
  interviewed: 'Interviewed',
  interview_rejected: 'Interview Rejected',
  invited_to_enrol: 'Invited to Enrol',
  enrolled: 'Enrolled',
  no_show: 'No Show',
  offer_expired: 'Offer Expired',
  not_invited: 'Not Invited',
}

// Cohort tracking types
export type CohortStatusEntry = {
  status: FunnelStatus
  updated_at: string
}

export type CohortStatuses = Record<string, CohortStatusEntry>

export const COHORT_OPTIONS = [
  { value: 'all', label: 'All Cohorts' },
  { value: 'March 16th 2026', label: 'March 16th 2026' },
  // Future cohorts added here
] as const

export type CohortFilter = typeof COHORT_OPTIONS[number]['value']

/**
 * Get a customer's funnel status for a specific cohort.
 * Returns the cohort-specific status, or falls back to global funnel_status
 * when cohort is 'all' or not found.
 */
export function getCustomerCohortStatus(
  customer: Customer,
  cohort: CohortFilter
): FunnelStatus {
  if (cohort === 'all') return customer.funnel_status
  const entry = customer.cohort_statuses?.[cohort]
  return (entry?.status as FunnelStatus) ?? 'registered'
}

// Central customer hub type
export type EnrichmentStatus = 'pending' | 'enriching' | 'enriched' | 'failed' | 'skipped'

export type Customer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  company_domain: string | null
  lead_type: 'professional' | 'pivoter' | 'unknown'
  classification_confidence: 'high' | 'medium' | 'low' | null
  funnel_status: FunnelStatus
  enrichment_status: EnrichmentStatus
  linkedin_url: string | null
  linkedin_title: string | null
  linkedin_company: string | null
  linkedin_headline: string | null
  linkedin_industry: string | null
  linkedin_location: string | null
  climate_signals: Record<string, unknown> | null
  enrollment_deadline: string | null
  cohort_statuses: CohortStatuses | null
  created_at: string
  updated_at: string
}

/** @deprecated Use Customer instead */
export type WorkshopLead = Customer

export type WorkshopRegistration = {
  id: string
  customer_id: string
  event_name: string
  event_date: string
  registration_date: string
  attended: boolean
  source_api_id: string | null
  created_at: string
}

export type CustomerWithAttendance = Customer & {
  attended_dates: string[]
}

/** @deprecated Use CustomerWithAttendance instead */
export type LeadWithAttendance = CustomerWithAttendance

// Satellite table types
export type CohortApplication = {
  id: string
  customer_id: string | null
  name: string
  email: string
  linkedin: string
  role: string
  background: string
  ai_view: string
  goals: string
  budget_confirmed: boolean | null
  cohort: string | null
  status: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  created_at: string
}

export type InterviewBooking = {
  id: string
  customer_id: string
  calendly_event_uri: string | null
  calendly_invitee_uri: string | null
  scheduled_at: string
  interviewee_name: string | null
  interviewee_email: string | null
  interviewer_name: string | null
  interviewer_email: string | null
  event_type: string | null
  location_type: string | null
  location_url: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  cohort: string | null
  created_at: string
  updated_at: string
}

export type Interview = {
  id: string
  customer_id: string
  interviewee_name: string | null
  interviewee_email: string | null
  booking_id: string | null
  fathom_recording_id: number | null
  fathom_recording_url: string | null
  fathom_summary: string | null
  transcript: string | null
  interviewer_notes: string | null
  outcome: 'approved' | 'rejected' | 'waitlisted' | 'pending' | null
  outcome_reason: string | null
  conducted_at: string | null
  cohort: string | null
  created_at: string
  updated_at: string
  activity_type: string | null
  applicant_scoring: number | null
  interviewer: string | null
}

export type Payment = {
  id: string
  customer_id: string
  enrollee_customer_id: string | null
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  stripe_customer_id: string | null
  amount_cents: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  product: string | null
  cohort: string | null
  paid_at: string | null
  refunded_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type Email = {
  id: string
  customer_id: string
  message_id: string | null
  direction: 'inbound' | 'outbound'
  from_address: string
  to_addresses: string[]
  cc_addresses: string[] | null
  subject: string | null
  body_preview: string | null
  email_type: string | null
  sent_at: string
  has_attachments: boolean
  importance: string
  conversation_id: string | null
  cohort: string | null
  created_at: string
  updated_at: string
}

export type PageView = {
  id: string
  created_at: string
  page_path: string
  page_title: string | null
  referrer: string | null
  user_agent: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

export type SystemLog = {
  id: string
  function_name: string
  function_type: 'api_route' | 'edge_function'
  http_method: string | null
  status: 'success' | 'error'
  status_code: number | null
  error_message: string | null
  duration_ms: number | null
  metadata: Record<string, unknown>
  invoked_at: string
  created_at: string
}

export type PendingFunnelChange = {
  id: string
  customer_id: string
  current_status: string
  proposed_status: string
  trigger_type: string
  trigger_detail: {
    subject?: string
    sender?: string
    recipient?: string
    sent_at?: string
    [key: string]: unknown
  } | null
  email_id: string | null
  cohort: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

// Funnel rank system — used for advancement checks (prevents backsliding)
export const FUNNEL_RANK: Record<string, number> = {
  registered: 1,
  applied: 2,
  application_rejected: 2,
  invited_to_interview: 3,
  booked: 4,
  interviewed: 5,
  no_show: 5,
  interview_rejected: 5,
  invited_to_enrol: 6,
  offer_expired: 6,
  enrolled: 7,
}

// Event name/label mapping
export const EVENT_LABELS: Record<string, string> = {
  '2025-12-04': 'Build a Climate Solution — Dec 4',
  '2025-12-17': 'Build a Climate Solution — Dec 17',
  '2026-01-13': 'Build a Climate Solution — Jan 13',
  '2026-02-05': 'Claude Code for Climate Work — Feb 5',
}

export function getEventLabel(date: string): string {
  return EVENT_LABELS[date] || new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getEventShortLabel(date: string): string {
  const labels: Record<string, string> = {
    '2025-12-04': 'Dec 4',
    '2025-12-17': 'Dec 17',
    '2026-01-13': 'Jan 13',
    '2026-02-05': 'Feb 5',
  }
  return labels[date] || new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Paginated fetch to bypass Supabase max_rows (1000) limit
// PAGE_SIZE must be < 1000 to avoid collision with PostgREST max_rows default
const PAGE_SIZE = 500

export async function fetchAll<T>(
  table: string,
  options?: { orderBy?: string; ascending?: boolean }
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0
  const client = getSupabase()

  while (true) {
    let query = client.from(table).select('*').range(from, from + PAGE_SIZE - 1)

    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending ?? true })
    }

    const { data, error } = await query

    if (error) {
      console.error(`Error fetching ${table}:`, error)
      return allRows
    }

    if (!data || data.length === 0) break

    allRows.push(...(data as T[]))

    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return allRows
}

export const personalDomains = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'live.com', 'proton.me', 'protonmail.com', 'aol.com', 'me.com',
  'ymail.com', 'yahoo.co.uk', 'msn.com', 'mail.com', 'gmx.de',
  'googlemail.com', 'mac.com', 'pm.me', 'btinternet.com',
])
