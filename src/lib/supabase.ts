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


// Funnel status types and helpers
export type FunnelStatus =
  | 'lead'
  | 'registered'
  | 'attended'
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
  | 'requested_discount'
  | 'deferred_next_cohort'
  | 'interview_deferred'
  | 'stale_application'
  | 'waitlist'

export const FUNNEL_STAGES: FunnelStatus[] = [
  'lead', 'registered', 'attended', 'applied', 'invited_to_interview',
  'booked', 'interviewed', 'invited_to_enrol', 'enrolled'
]

export const SIDE_STATUSES: FunnelStatus[] = [
  'application_rejected', 'interview_rejected',
  'no_show', 'offer_expired', 'not_invited',
  'requested_discount', 'deferred_next_cohort',
  'interview_deferred',
  'stale_application', 'waitlist',
]

export const FUNNEL_LABELS: Record<FunnelStatus, string> = {
  lead: 'Lead',
  registered: 'Registered',
  attended: 'Attended',
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
  requested_discount: 'Requested Discount',
  deferred_next_cohort: 'Deferred Cohort',
  interview_deferred: 'Deferred (Next Cohort)',
  stale_application: 'Stale Application',
  waitlist: 'Waitlist',
}

// Cohort tracking types
export type CohortStatusEntry = {
  status: FunnelStatus
  updated_at: string
}

export type CohortStatuses = Record<string, CohortStatusEntry>

export const COHORT_OPTIONS = [
  { value: 'all', label: 'All Cohorts' },
  { value: 'May 18th 2026', label: 'May 18th 2026' },
  { value: 'March 16th 2026', label: 'March 16th 2026' },
  { value: 'January 19th 2026', label: 'January 19th 2026' },
  { value: 'VoizAI', label: 'VoizAI (Rolling)' },
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
  discord_user_id: string | null
  discord_status: DiscordStatus | null
  notes: string | null
  created_at: string
  updated_at: string
}


export type WorkshopRegistration = {
  id: string
  customer_id: string
  event_name: string
  event_date: string
  registration_date: string
  attended: boolean
  source_api_id: string | null
  created_at: string
  name: string | null
  email: string | null
  utm_source: string | null
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

export type EmailStatus =
  | 'draft'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'failed'

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
  // Resend tracking fields
  resend_email_id: string | null
  status: EmailStatus | null
  delivered_at: string | null
  opened_at: string | null
  first_opened_at: string | null
  last_opened_at: string | null
  open_count: number
  clicked_at: string | null
  first_clicked_at: string | null
  last_clicked_at: string | null
  click_count: number
  bounced_at: string | null
  complained_at: string | null
  error_message: string | null
  template_id: string | null
  unsubscribe_token: string | null
  sent_via: 'outlook' | 'resend' | null
  created_at: string
  updated_at: string
}

export type EmailTemplate = {
  id: string
  name: string
  subject: string
  preview_text: string | null
  content: string
  template_type: 'transactional' | 'marketing'
  funnel_trigger: string | null
  from_address: string | null
  reply_to: string | null
  cc_addresses: string[] | null
  is_active: 'active' | 'partial' | 'inactive'
  created_at: string
  updated_at: string
}

export type PendingEmail = {
  id: string
  customer_id: string
  template_id: string
  trigger_event: string
  trigger_detail: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

export type EmailAutomationStep = {
  delay_hours: number
  template_id: string
  conditions?: Record<string, unknown>
}

export type EmailAutomation = {
  id: string
  name: string
  description: string | null
  trigger_event: string
  is_active: boolean
  email_flow: EmailAutomationStep[]
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

export type DiscordStatus = 'not_invited' | 'invited' | 'joined' | 'roles_assigned'

export type DiscordMember = {
  id: string
  discord_user_id: string
  discord_username: string
  discord_display_name: string | null
  discord_avatar_url: string | null
  joined_server_at: string | null
  customer_id: string | null
  matched_at: string | null
  matched_by: string | null
  roles: string[]
  created_at: string
  updated_at: string
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
  lead: 0,
  registered: 1,
  attended: 2,
  applied: 3,
  application_rejected: 3,
  invited_to_interview: 4,
  not_invited: 4,
  interview_deferred: 4,
  stale_application: 4,
  booked: 5,
  interviewed: 6,
  no_show: 6,
  interview_rejected: 6,
  invited_to_enrol: 7,
  offer_expired: 7,
  requested_discount: 7,
  deferred_next_cohort: 7,
  waitlist: 7,
  enrolled: 8,
}

// Event name/label mapping
export const EVENT_LABELS: Record<string, string> = {
  '2025-12-04': 'Build a Climate Solution — Dec 4',
  '2025-12-17': 'Build a Climate Solution — Dec 17',
  '2026-01-13': 'Build a Climate Solution — Jan 13',
  '2026-02-05': 'Claude Code for Climate Work — Feb 5',
  '2026-02-26': 'Claude Code for Climate Risk — Feb 26',
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
    '2026-02-26': 'Feb 26',
  }
  return labels[date] || new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Paginated fetch to bypass Supabase max_rows (1000) limit
// PAGE_SIZE must be < 1000 to avoid collision with PostgREST max_rows default
const PAGE_SIZE = 500

export async function fetchAll<T>(
  table: string,
  options?: { orderBy?: string; ascending?: boolean; select?: string }
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0
  const client = getSupabase()
  const selectStr = options?.select ?? '*'

  while (true) {
    let query = client.from(table).select(selectStr).range(from, from + PAGE_SIZE - 1)

    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending ?? true })
    }

    const { data, error } = await query

    if (error) {
      console.error(`Error fetching ${table}:`, error)
      return allRows
    }

    if (!data || data.length === 0) break

    allRows.push(...(data as unknown as T[]))

    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return allRows
}

// ---------- Engagements (B2B pipeline — separate from cohort funnel) ----------

export type EngagementStream = 'corporate_contract' | 'partner' | 'coach'

export type EngagementStage =
  | 'intro'
  | 'discovery'
  | 'proposal_sent'
  | 'negotiation'
  | 'won'
  | 'live'
  | 'closed'
  | 'lost'
  | 'dormant'

export type Engagement = {
  id: string
  slug: string
  organization_name: string
  stream: EngagementStream
  stage: EngagementStage
  primary_contact_name: string | null
  primary_contact_email: string | null
  primary_contact_role: string | null
  region: string | null
  owner: string | null
  source: string | null
  expected_value_cents: number | null
  expected_close_date: string | null
  last_interaction_at: string | null
  next_steps: string | null
  proposals: string[] | null
  folder_path: string | null
  notes_markdown: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export const ENGAGEMENT_STREAM_LABELS: Record<EngagementStream, string> = {
  corporate_contract: 'Corporate Contracts',
  partner: 'Partners',
  coach: 'Coaches',
}

export const ENGAGEMENT_STAGE_LABELS: Record<EngagementStage, string> = {
  intro: 'Intro',
  discovery: 'Discovery',
  proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  live: 'Live',
  closed: 'Closed',
  lost: 'Lost',
  dormant: 'Dormant',
}

export const ENGAGEMENT_STAGE_RANK: Record<EngagementStage, number> = {
  intro: 1,
  discovery: 2,
  proposal_sent: 3,
  negotiation: 4,
  won: 5,
  live: 6,
  closed: 7,
  lost: 0,
  dormant: 0,
}

export function engagementStageBadgeClasses(stage: EngagementStage): string {
  switch (stage) {
    case 'intro':
      return 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.6)] border border-[rgba(232,230,227,0.1)]'
    case 'discovery':
      return 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]'
    case 'proposal_sent':
      return 'bg-[rgba(73,133,115,0.15)] text-[#498573] border border-[rgba(73,133,115,0.3)]'
    case 'negotiation':
      return 'bg-[rgba(234,179,8,0.15)] text-[#EAB308] border border-[rgba(234,179,8,0.3)]'
    case 'won':
    case 'live':
      return 'bg-[rgba(37,89,67,0.15)] text-[#255943] border border-[rgba(37,89,67,0.3)]'
    case 'closed':
      return 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.4)] border border-[rgba(232,230,227,0.1)]'
    case 'lost':
      return 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)]'
    case 'dormant':
      return 'bg-[rgba(217,119,6,0.15)] text-[#D97706] border border-[rgba(217,119,6,0.3)]'
  }
}

// ---------- Personal email domains ----------

export const personalDomains = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'live.com', 'proton.me', 'protonmail.com', 'aol.com', 'me.com',
  'ymail.com', 'yahoo.co.uk', 'msn.com', 'mail.com', 'gmx.de',
  'googlemail.com', 'mac.com', 'pm.me', 'btinternet.com',
])
