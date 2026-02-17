/**
 * Fathom API client for interview recording ingestion.
 * Handles fetching meetings, verifying webhooks, and mapping data to the interviews table.
 *
 * API Docs: https://api.fathom.ai/external/v1
 * Auth: X-Api-Key header (user-level, accesses recordings by key owner)
 */

import { supabase } from './supabase'
import { getSecret, getSecrets } from './secrets'

const FATHOM_BASE_URL = 'https://api.fathom.ai/external/v1'

// Interviewer email-to-name mapping (extensible for Diego later)
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
export interface FathomAccount {
  apiKey: string
  email: string
  name: string
}

async function getApiKeys(): Promise<FathomAccount[]> {
  const secrets = await getSecrets(['FATHOM_API_KEY', 'FATHOM_API_KEY_DIEGO'])
  const accounts: FathomAccount[] = []

  if (secrets.FATHOM_API_KEY) {
    accounts.push({ apiKey: secrets.FATHOM_API_KEY, email: 'ben@kithailab.com', name: 'Ben Hillier' })
  }

  if (secrets.FATHOM_API_KEY_DIEGO) {
    accounts.push({ apiKey: secrets.FATHOM_API_KEY_DIEGO, email: 'diego@kithailab.com', name: 'Diego Espinosa' })
  }

  if (accounts.length === 0) {
    throw new Error('No Fathom API keys found in app_secrets')
  }

  return accounts
}

/** Get the default (Ben's) API key for backward compatibility. */
async function getApiKey(): Promise<string> {
  const key = await getSecret('FATHOM_API_KEY')
  if (!key) throw new Error('FATHOM_API_KEY not found in app_secrets')
  return key
}

// --- API Functions ---

async function fathomFetch<T>(path: string, params?: Record<string, string>, apiKey?: string): Promise<T> {
  const url = new URL(`${FATHOM_BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
  }

  const resolvedKey = apiKey || await getApiKey()
  const response = await fetch(url.toString(), {
    headers: {
      'X-Api-Key': resolvedKey,
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
 * Fetch a single meeting by recording ID with transcript and summary.
 * Optionally pass an apiKey to search a specific account; otherwise uses default.
 */
export async function fetchMeeting(recordingId: number, apiKey?: string): Promise<FathomMeeting> {
  const response = await fathomFetch<FathomMeetingsResponse>('/meetings', {
    'include_transcript': 'true',
    'include_summary': 'true',
  }, apiKey)

  let meeting = response.items.find(m => m.recording_id === recordingId)
  let cursor = response.next_cursor

  while (!meeting && cursor) {
    const nextPage = await fathomFetch<FathomMeetingsResponse>('/meetings', {
      'include_transcript': 'true',
      'include_summary': 'true',
      'cursor': cursor,
    }, apiKey)
    meeting = nextPage.items.find(m => m.recording_id === recordingId)
    cursor = nextPage.next_cursor
  }

  if (!meeting) {
    throw new Error(`Meeting with recording_id ${recordingId} not found`)
  }

  return meeting
}

/**
 * Fetch a single meeting by recording ID, trying all configured Fathom accounts.
 * Returns the meeting from whichever account owns it.
 */
export async function fetchMeetingFromAnyAccount(recordingId: number): Promise<FathomMeeting> {
  const accounts = await getApiKeys()

  for (const account of accounts) {
    try {
      return await fetchMeeting(recordingId, account.apiKey)
    } catch {
      // Meeting not found on this account, try next
      continue
    }
  }

  throw new Error(`Meeting with recording_id ${recordingId} not found on any Fathom account`)
}

/**
 * Fetch all meetings for a given recorder email, paginating through all results.
 * Optionally pass an apiKey to query a specific account.
 */
export async function fetchAllMeetings(
  recorderEmail: string,
  options?: { includeTranscript?: boolean; includeSummary?: boolean; apiKey?: string }
): Promise<FathomMeeting[]> {
  const allMeetings: FathomMeeting[] = []
  let cursor: string | null = null

  do {
    const params: Record<string, string> = {
      'recorded_by[]': recorderEmail,
      'include_transcript': String(options?.includeTranscript ?? true),
      'include_summary': String(options?.includeSummary ?? true),
    }
    if (cursor) params['cursor'] = cursor

    const response = await fathomFetch<FathomMeetingsResponse>('/meetings', params, options?.apiKey)
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
  const accounts = await getApiKeys()
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

/**
 * Verify Fathom webhook signature (HMAC-SHA256).
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Fathom uses HMAC-SHA256 with the webhook secret
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const computed = Buffer.from(sig).toString('hex')

  // Compare signatures (timing-safe comparison)
  if (computed.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

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

/**
 * Find a customer by email in kith_climate.customers.
 * Returns the customer ID if found, null otherwise.
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
 * Upsert an interview record from Fathom meeting data.
 * Uses fathom_recording_id as the unique key for deduplication.
 */
export async function upsertInterview(
  data: MappedInterviewData,
  customerId: string | null,
  cohort?: string
) {
  const row = {
    customer_id: customerId,
    interviewee_name: data.interviewee_name,
    interviewee_email: data.interviewee_email,
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
