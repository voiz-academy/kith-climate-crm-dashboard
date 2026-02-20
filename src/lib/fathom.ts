/**
 * Fathom API client for interview recording backfill.
 *
 * Used by the /api/fathom/backfill endpoint to fetch all meetings from Fathom
 * and upsert them into the interviews table.
 *
 * NOTE: Real-time webhook processing is handled by Supabase Edge Functions
 * (fathom-webhook, calendly-webhook, stripe-kith-climate-webhook) which
 * access secrets via Deno.env.get() from Supabase Edge Function Secrets.
 *
 * API Docs: https://api.fathom.ai/external/v1
 * Auth: X-Api-Key header (user-level, accesses recordings by key owner)
 */

import { supabase, getSupabase } from './supabase'
import { getSecrets } from './secrets'
import { findOrCreateCustomer } from './customer-sync'

const FATHOM_BASE_URL = 'https://api.fathom.ai/external/v1'

// Interviewer email-to-name mapping
const INTERVIEWER_MAP: Record<string, string> = {
  'benh@voiz.academy': 'Ben Hillier',
  'ben@kithailab.com': 'Ben Hillier',
  'diego@voiz.academy': 'Diego Espinosa',
  'diego@kithailab.com': 'Diego Espinosa',
}

// --- Fathom API Types (from actual API responses) ---

export interface FathomTranscriptEntry {
  speaker: {
    display_name: string
    matched_calendar_invitee_email: string | null
  }
  text: string
  timestamp: string // "HH:MM:SS"
}

export interface FathomSummary {
  template_name: string
  markdown_formatted: string
}

export interface FathomCalendarInvitee {
  name: string
  email: string
  email_domain: string
  is_external: boolean
  matched_speaker_display_name: string | null
}

export interface FathomRecordedBy {
  name: string
  email: string
  email_domain: string
  team: string | null
}

export interface FathomMeeting {
  title: string
  meeting_title: string
  recording_id: number
  url: string
  share_url: string
  created_at: string
  scheduled_start_time: string
  scheduled_end_time: string
  recording_start_time: string
  recording_end_time: string
  calendar_invitees_domains_type: string
  transcript: FathomTranscriptEntry[] | null
  transcript_language: string
  default_summary: FathomSummary | null
  action_items: unknown[] | null
  calendar_invitees: FathomCalendarInvitee[]
  recorded_by: FathomRecordedBy
  crm_matches: unknown | null
}

export interface FathomMeetingsResponse {
  items: FathomMeeting[]
  next_cursor: string | null
  limit: number
}

// --- Mapped interview data for upsert ---

export interface MappedInterviewData {
  fathom_recording_id: number
  fathom_recording_url: string
  fathom_summary: string | null
  transcript: string | null
  interviewee_name: string | null
  interviewee_email: string | null
  interviewer: string
  conducted_at: string
  activity_type: string
}

// --- API Key Management ---

/** All configured Fathom API accounts with their associated email. */
interface FathomAccount {
  apiKey: string
  email: string
  name: string
}

function getApiKeys(): FathomAccount[] {
  const secrets = getSecrets(['FATHOM_API_KEY', 'FATHOM_API_KEY_DIEGO'])
  const accounts: FathomAccount[] = []

  if (secrets.FATHOM_API_KEY) {
    accounts.push({ apiKey: secrets.FATHOM_API_KEY, email: 'ben@kithailab.com', name: 'Ben Hillier' })
  }

  if (secrets.FATHOM_API_KEY_DIEGO) {
    accounts.push({ apiKey: secrets.FATHOM_API_KEY_DIEGO, email: 'diego@kithailab.com', name: 'Diego Espinosa' })
  }

  if (accounts.length === 0) {
    throw new Error('No Fathom API keys found in environment variables')
  }

  return accounts
}

// --- API Functions ---

async function fathomFetch<T>(path: string, params?: Record<string, string>, apiKey?: string): Promise<T> {
  if (!apiKey) throw new Error('apiKey is required for fathomFetch')

  const url = new URL(`${FATHOM_BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
  }

  const response = await fetch(url.toString(), {
    headers: {
      'X-Api-Key': apiKey,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Fathom API error ${response.status}: ${text}`)
  }

  return response.json() as Promise<T>
}

/**
 * Fetch all meetings for a given recorder email, paginating through all results.
 */
async function fetchAllMeetings(
  recorderEmail: string,
  options: { includeTranscript?: boolean; includeSummary?: boolean; apiKey: string }
): Promise<FathomMeeting[]> {
  const allMeetings: FathomMeeting[] = []
  let cursor: string | null = null

  do {
    const params: Record<string, string> = {
      'recorded_by[]': recorderEmail,
      'include_transcript': String(options.includeTranscript ?? true),
      'include_summary': String(options.includeSummary ?? true),
    }
    if (cursor) params['cursor'] = cursor

    const response = await fathomFetch<FathomMeetingsResponse>('/meetings', params, options.apiKey)
    allMeetings.push(...response.items)
    cursor = response.next_cursor
  } while (cursor)

  return allMeetings
}

/**
 * Fetch all meetings from all configured Fathom accounts.
 * Each account's API key can only access that user's recordings.
 */
export async function fetchAllMeetingsFromAllAccounts(
  options?: { includeTranscript?: boolean; includeSummary?: boolean }
): Promise<FathomMeeting[]> {
  const accounts = getApiKeys()
  const allMeetings: FathomMeeting[] = []

  for (const account of accounts) {
    console.log(`Fetching meetings for ${account.name} (${account.email})...`)
    const meetings = await fetchAllMeetings(account.email, {
      ...options,
      apiKey: account.apiKey,
    })
    console.log(`Found ${meetings.length} meetings for ${account.name}`)
    allMeetings.push(...meetings)
  }

  return allMeetings
}

// --- Data Mapping ---

/**
 * Format Fathom transcript entries into a readable string with speaker attribution.
 */
export function formatTranscript(entries: FathomTranscriptEntry[]): string {
  return entries
    .map(entry => `[${entry.timestamp}] ${entry.speaker.display_name}: ${entry.text}`)
    .join('\n')
}

/**
 * Format Fathom summary + action items into a single text field.
 */
export function formatSummary(meeting: FathomMeeting): string | null {
  const parts: string[] = []

  if (meeting.default_summary?.markdown_formatted) {
    parts.push(meeting.default_summary.markdown_formatted)
  }

  if (meeting.action_items && Array.isArray(meeting.action_items) && meeting.action_items.length > 0) {
    parts.push('\n## Action Items')
    meeting.action_items.forEach((item: unknown) => {
      const desc = (item as { description?: string })?.description || String(item)
      parts.push(`- ${desc}`)
    })
  }

  return parts.length > 0 ? parts.join('\n') : null
}

/**
 * Extract the external interviewee from calendar invitees.
 * Returns the first external invitee (is_external = true).
 */
export function extractInterviewee(invitees: FathomCalendarInvitee[]): {
  name: string | null
  email: string | null
} {
  const external = invitees.find(inv => inv.is_external)
  if (!external) return { name: null, email: null }
  return { name: external.name, email: external.email }
}

/**
 * Map a Fathom meeting to interview table data.
 */
export function extractInterviewData(meeting: FathomMeeting): MappedInterviewData {
  const interviewee = extractInterviewee(meeting.calendar_invitees)
  const interviewerName = INTERVIEWER_MAP[meeting.recorded_by.email] || meeting.recorded_by.name

  return {
    fathom_recording_id: meeting.recording_id,
    fathom_recording_url: meeting.share_url,
    fathom_summary: formatSummary(meeting),
    transcript: meeting.transcript ? formatTranscript(meeting.transcript) : null,
    interviewee_name: interviewee.name,
    interviewee_email: interviewee.email,
    interviewer: interviewerName,
    conducted_at: meeting.recording_start_time,
    activity_type: 'demo',
  }
}

// --- Database Operations ---

/**
 * Find a customer by email in kith_climate.customers.
 * Returns the customer ID if found, null otherwise.
 *
 * @deprecated Use findOrCreateCustomer() from customer-sync.ts instead.
 */
export async function findCustomerByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email.toLowerCase())
    .limit(1)
    .single()

  if (error || !data) return null
  return data.id
}

/**
 * Find or create a customer, then resolve a matching booking_id.
 * Convenience wrapper for backfill operations.
 */
export async function resolveCustomerAndBooking(email: string, name?: string | null): Promise<{
  customerId: string
  bookingId: string | null
}> {
  const { customerId } = await findOrCreateCustomer(email, name)

  // Try to find a matching booking
  const { data: booking } = await getSupabase()
    .from('interviews_booked')
    .select('id')
    .eq('interviewee_email', email.toLowerCase().trim())
    .is('cancelled_at', null)
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .single()

  return { customerId, bookingId: booking?.id ?? null }
}

/**
 * Upsert an interview record from Fathom meeting data.
 * Uses fathom_recording_id as the unique key for deduplication.
 */
export async function upsertInterview(
  data: MappedInterviewData,
  customerId: string | null,
  cohort?: string,
  bookingId?: string | null
) {
  const row = {
    customer_id: customerId,
    interviewee_name: data.interviewee_name,
    interviewee_email: data.interviewee_email,
    booking_id: bookingId ?? null,
    fathom_recording_id: data.fathom_recording_id,
    fathom_recording_url: data.fathom_recording_url,
    fathom_summary: data.fathom_summary,
    transcript: data.transcript,
    interviewer: data.interviewer,
    conducted_at: data.conducted_at,
    activity_type: data.activity_type,
    cohort: cohort || null,
    updated_at: new Date().toISOString(),
  }

  // Check if interview already exists by fathom_recording_id
  const { data: existing } = await supabase
    .from('interviews')
    .select('id')
    .eq('fathom_recording_id', data.fathom_recording_id)
    .limit(1)
    .single()

  if (existing) {
    // Update existing row
    const { error } = await supabase
      .from('interviews')
      .update(row)
      .eq('fathom_recording_id', data.fathom_recording_id)

    if (error) throw new Error(`Failed to update interview: ${error.message}`)
    return { action: 'updated' as const, id: existing.id }
  } else {
    // Insert new row
    const { data: inserted, error } = await supabase
      .from('interviews')
      .insert(row)
      .select('id')
      .single()

    if (error) throw new Error(`Failed to insert interview: ${error.message}`)
    return { action: 'created' as const, id: inserted.id }
  }
}
