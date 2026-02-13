import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'kith_climate'
  }
})

// Funnel status types and helpers
export type FunnelStatus =
  | 'registered'
  | 'applied'
  | 'invited_to_interview'
  | 'booked'
  | 'interviewed'
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
  'no_show', 'offer_expired', 'not_invited'
]

export const FUNNEL_LABELS: Record<FunnelStatus, string> = {
  registered: 'Registered',
  applied: 'Applied',
  invited_to_interview: 'Invited to Interview',
  booked: 'Booked',
  interviewed: 'Interviewed',
  invited_to_enrol: 'Invited to Enrol',
  enrolled: 'Enrolled',
  no_show: 'No Show',
  offer_expired: 'Offer Expired',
  not_invited: 'Not Invited',
}

// Central customer hub type
export type Customer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  company_domain: string | null
  lead_type: 'professional' | 'pivoter' | 'unknown'
  classification_confidence: 'high' | 'medium' | 'low' | null
  funnel_status: FunnelStatus
  linkedin_url: string | null
  linkedin_title: string | null
  linkedin_company: string | null
  linkedin_headline: string | null
  linkedin_industry: string | null
  linkedin_location: string | null
  climate_signals: Record<string, unknown> | null
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
  booking_id: string | null
  zoom_meeting_id: string | null
  zoom_recording_url: string | null
  transcript: string | null
  interviewer_notes: string | null
  outcome: 'approved' | 'rejected' | 'waitlisted' | 'pending' | null
  outcome_reason: string | null
  conducted_at: string | null
  cohort: string | null
  created_at: string
  updated_at: string
}

export type Payment = {
  id: string
  customer_id: string
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

  while (true) {
    let query = supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1)

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
