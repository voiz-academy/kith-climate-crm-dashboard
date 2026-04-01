import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Config ---

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FATHOM_BASE_URL = "https://api.fathom.ai/external/v1";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: "kith_climate" },
});

// --- Default Cohort ---

const DEFAULT_COHORT = "May 18th 2026";

// --- Cohort Derivation ---

function deriveCohort(
  cohortStatuses: Record<string, { status: string; updated_at: string }> | null
): string {
  if (!cohortStatuses) return DEFAULT_COHORT;
  const entries = Object.entries(cohortStatuses);
  if (entries.length === 0) return DEFAULT_COHORT;
  let latestDate = "";
  let latestCohort = DEFAULT_COHORT;
  for (const [key, val] of entries) {
    if (val.updated_at > latestDate) {
      latestDate = val.updated_at;
      latestCohort = key;
    }
  }
  return latestCohort;
}

// --- Interviewer Mapping ---

const INTERVIEWER_MAP: Record<string, string> = {
  "benh@voiz.academy": "Ben Hillier",
  "ben@kithailab.com": "Ben Hillier",
  "diego@voiz.academy": "Diego Espinosa",
  "diego@kithailab.com": "Diego Espinosa",
};

// --- Fathom API Types ---

interface FathomTranscriptEntry {
  speaker: {
    display_name: string;
    matched_calendar_invitee_email: string | null;
  };
  text: string;
  timestamp: string;
}

interface FathomSummary {
  template_name: string;
  markdown_formatted: string;
}

interface FathomCalendarInvitee {
  name: string;
  email: string;
  email_domain: string;
  is_external: boolean;
  matched_speaker_display_name: string | null;
}

interface FathomRecordedBy {
  name: string;
  email: string;
  email_domain: string;
  team: string | null;
}

interface FathomMeeting {
  title: string;
  meeting_title: string;
  recording_id: number;
  url: string;
  share_url: string;
  created_at: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  recording_start_time: string;
  recording_end_time: string;
  calendar_invitees_domains_type: string;
  transcript: FathomTranscriptEntry[] | null;
  transcript_language: string;
  default_summary: FathomSummary | null;
  action_items: unknown[] | null;
  calendar_invitees: FathomCalendarInvitee[];
  recorded_by: FathomRecordedBy;
  crm_matches: unknown | null;
}

interface FathomMeetingsResponse {
  items: FathomMeeting[];
  next_cursor: string | null;
  limit: number;
}

interface MappedInterviewData {
  fathom_recording_id: number;
  fathom_recording_url: string;
  fathom_summary: string | null;
  transcript: string | null;
  interviewee_name: string | null;
  interviewee_email: string | null;
  interviewer: string;
  conducted_at: string;
  activity_type: string;
}

// --- Fathom API Key Management ---

interface FathomAccount {
  apiKey: string;
  email: string;
  name: string;
}

function getApiKeys(): FathomAccount[] {
  const accounts: FathomAccount[] = [];

  const benKey = Deno.env.get("FATHOM_API_KEY");
  if (benKey) {
    accounts.push({
      apiKey: benKey,
      email: "ben@kithailab.com",
      name: "Ben Hillier",
    });
  }

  const diegoKey = Deno.env.get("FATHOM_API_KEY_DIEGO");
  if (diegoKey) {
    accounts.push({
      apiKey: diegoKey,
      email: "diego@kithailab.com",
      name: "Diego Espinosa",
    });
  }

  if (accounts.length === 0) {
    throw new Error("No Fathom API keys found in environment variables");
  }

  return accounts;
}

// --- Fathom API Functions ---

async function fathomFetch<T>(
  path: string,
  params?: Record<string, string>,
  apiKey?: string
): Promise<T> {
  if (!apiKey) throw new Error("apiKey is required for fathomFetch");

  const url = new URL(`${FATHOM_BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fathom API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

async function fetchAllMeetings(
  recorderEmail: string,
  options: {
    includeTranscript?: boolean;
    includeSummary?: boolean;
    apiKey: string;
  }
): Promise<FathomMeeting[]> {
  const allMeetings: FathomMeeting[] = [];
  let cursor: string | null = null;

  do {
    const params: Record<string, string> = {
      "recorded_by[]": recorderEmail,
      include_transcript: String(options.includeTranscript ?? true),
      include_summary: String(options.includeSummary ?? true),
    };
    if (cursor) params["cursor"] = cursor;

    const response = await fathomFetch<FathomMeetingsResponse>(
      "/meetings",
      params,
      options.apiKey
    );
    allMeetings.push(...response.items);
    cursor = response.next_cursor;
  } while (cursor);

  return allMeetings;
}

async function fetchAllMeetingsFromAllAccounts(options?: {
  includeTranscript?: boolean;
  includeSummary?: boolean;
}): Promise<FathomMeeting[]> {
  const accounts = getApiKeys();
  const allMeetings: FathomMeeting[] = [];

  for (const account of accounts) {
    console.log(
      `Fetching meetings for ${account.name} (${account.email})...`
    );
    const meetings = await fetchAllMeetings(account.email, {
      ...options,
      apiKey: account.apiKey,
    });
    console.log(`Found ${meetings.length} meetings for ${account.name}`);
    allMeetings.push(...meetings);
  }

  return allMeetings;
}

// --- Data Mapping ---

function formatTranscript(entries: FathomTranscriptEntry[]): string {
  return entries
    .map(
      (entry) =>
        `[${entry.timestamp}] ${entry.speaker.display_name}: ${entry.text}`
    )
    .join("\n");
}

function formatSummary(meeting: FathomMeeting): string | null {
  const parts: string[] = [];

  if (meeting.default_summary?.markdown_formatted) {
    parts.push(meeting.default_summary.markdown_formatted);
  }

  if (
    meeting.action_items &&
    Array.isArray(meeting.action_items) &&
    meeting.action_items.length > 0
  ) {
    parts.push("\n## Action Items");
    meeting.action_items.forEach((item: unknown) => {
      const desc =
        (item as { description?: string })?.description || String(item);
      parts.push(`- ${desc}`);
    });
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

function extractInterviewee(invitees: FathomCalendarInvitee[]): {
  name: string | null;
  email: string | null;
} {
  const external = invitees.find((inv) => inv.is_external);
  if (!external) return { name: null, email: null };
  return { name: external.name, email: external.email };
}

function extractInterviewData(meeting: FathomMeeting): MappedInterviewData {
  const interviewee = extractInterviewee(meeting.calendar_invitees);
  const interviewerName =
    INTERVIEWER_MAP[meeting.recorded_by.email] || meeting.recorded_by.name;

  return {
    fathom_recording_id: meeting.recording_id,
    fathom_recording_url: meeting.share_url,
    fathom_summary: formatSummary(meeting),
    transcript: meeting.transcript
      ? formatTranscript(meeting.transcript)
      : null,
    interviewee_name: interviewee.name,
    interviewee_email: interviewee.email,
    interviewer: interviewerName,
    conducted_at: meeting.recording_start_time,
    activity_type: "demo",
  };
}

// --- Database Operations ---

async function findCustomerByEmail(
  email: string
): Promise<{ id: string; cohort_statuses: Record<string, { status: string; updated_at: string }> | null } | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, cohort_statuses")
    .eq("email", email.toLowerCase())
    .limit(1)
    .single();

  if (error || !data) return null;
  return { id: data.id, cohort_statuses: data.cohort_statuses };
}

async function findOrCreateCustomer(
  email: string,
  name?: string | null
): Promise<{ id: string; cohort_statuses: Record<string, { status: string; updated_at: string }> | null; created: boolean }> {
  const normEmail = email.toLowerCase().trim();

  const existing = await findCustomerByEmail(normEmail);
  if (existing) {
    return { id: existing.id, cohort_statuses: existing.cohort_statuses, created: false };
  }

  // Split name into first/last if provided
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (name) {
    const parts = name.trim().split(/\s+/);
    firstName = parts[0] || null;
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("customers")
    .upsert(
      {
        email: normEmail,
        first_name: firstName,
        last_name: lastName,
        funnel_status: "registered",
        enrichment_status: "pending",
        lead_type: "unknown",
      },
      { onConflict: "email", ignoreDuplicates: true }
    )
    .select("id, cohort_statuses")
    .single();

  if (insertErr || !inserted) {
    // Re-fetch if upsert returned nothing (race condition)
    const retried = await findCustomerByEmail(normEmail);
    if (retried) {
      return { id: retried.id, cohort_statuses: retried.cohort_statuses, created: false };
    }
    throw new Error(`Failed to create customer for ${normEmail}: ${insertErr?.message}`);
  }

  return { id: inserted.id, cohort_statuses: inserted.cohort_statuses, created: true };
}

async function resolveCustomerAndBooking(
  email: string,
  name?: string | null
): Promise<{
  customerId: string;
  cohortStatuses: Record<string, { status: string; updated_at: string }> | null;
  bookingId: string | null;
}> {
  const { id: customerId, cohort_statuses: cohortStatuses } =
    await findOrCreateCustomer(email, name);

  // Try to find a matching booking
  const { data: booking } = await supabase
    .from("interviews_booked")
    .select("id")
    .eq("interviewee_email", email.toLowerCase().trim())
    .is("cancelled_at", null)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .single();

  return {
    customerId,
    cohortStatuses,
    bookingId: booking?.id ?? null,
  };
}

async function upsertInterview(
  data: MappedInterviewData,
  customerId: string | null,
  cohort: string,
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
    cohort: cohort,
    updated_at: new Date().toISOString(),
  };

  // Check if interview already exists by fathom_recording_id
  const { data: existing } = await supabase
    .from("interviews")
    .select("id")
    .eq("fathom_recording_id", data.fathom_recording_id)
    .limit(1)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("interviews")
      .update(row)
      .eq("fathom_recording_id", data.fathom_recording_id);

    if (error)
      throw new Error(`Failed to update interview: ${error.message}`);
    return { action: "updated" as const, id: existing.id };
  } else {
    const { data: inserted, error } = await supabase
      .from("interviews")
      .insert(row)
      .select("id")
      .single();

    if (error)
      throw new Error(`Failed to insert interview: ${error.message}`);
    return { action: "created" as const, id: inserted.id };
  }
}

// --- Update helpers for existing interviews ---

async function updateExistingInterview(
  interviewId: string,
  meeting: FathomMeeting
) {
  const interviewData = extractInterviewData(meeting);

  const updateFields: Record<string, unknown> = {
    fathom_recording_id: interviewData.fathom_recording_id,
    updated_at: new Date().toISOString(),
  };

  // Only update fields that are currently NULL (don't overwrite existing data)
  if (interviewData.transcript)
    updateFields.transcript = interviewData.transcript;
  if (interviewData.fathom_summary)
    updateFields.fathom_summary = interviewData.fathom_summary;
  if (interviewData.interviewee_name)
    updateFields.interviewee_name = interviewData.interviewee_name;
  if (interviewData.interviewee_email)
    updateFields.interviewee_email = interviewData.interviewee_email;

  const { error } = await supabase
    .from("interviews")
    .update(updateFields)
    .eq("id", interviewId);

  if (error)
    throw new Error(
      `Failed to update interview ${interviewId}: ${error.message}`
    );
}

async function updateExistingByRecordingId(meeting: FathomMeeting) {
  const interviewData = extractInterviewData(meeting);

  // Check what's currently NULL
  const { data: current } = await supabase
    .from("interviews")
    .select("transcript, fathom_summary")
    .eq("fathom_recording_id", meeting.recording_id)
    .single();

  if (!current) return;

  const updateFields: Record<string, unknown> = {};
  if (!current.transcript && interviewData.transcript) {
    updateFields.transcript = interviewData.transcript;
  }
  if (!current.fathom_summary && interviewData.fathom_summary) {
    updateFields.fathom_summary = interviewData.fathom_summary;
  }

  if (Object.keys(updateFields).length === 0) return;

  updateFields.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("interviews")
    .update(updateFields)
    .eq("fathom_recording_id", meeting.recording_id);

  if (error)
    throw new Error(
      `Failed to update by recording_id ${meeting.recording_id}: ${error.message}`
    );
}

// --- System Logs ---

async function logToSystemLogs(
  status: "success" | "error",
  statusCode: number,
  durationMs: number,
  metadata: Record<string, unknown> = {},
  errorMessage?: string
) {
  try {
    await supabase.from("system_logs").insert({
      function_name: "fathom-backfill",
      function_type: "edge_function",
      http_method: "POST",
      status,
      status_code: statusCode,
      duration_ms: durationMs,
      error_message: errorMessage || null,
      metadata,
      invoked_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to write system_logs:", e);
  }
}

// --- Main Handler ---

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const startTime = Date.now();

  try {
    // 1. Fetch all existing interviews to match against
    const { data: existingInterviews, error: fetchError } = await supabase
      .from("interviews")
      .select(
        "id, fathom_recording_url, fathom_recording_id, interviewee_email"
      );

    if (fetchError) throw fetchError;

    // Build lookup maps
    const urlToInterviewId = new Map<string, string>();
    const recordingIdSet = new Set<number>();

    existingInterviews?.forEach((interview) => {
      if (interview.fathom_recording_url) {
        urlToInterviewId.set(interview.fathom_recording_url, interview.id);
      }
      if (interview.fathom_recording_id) {
        recordingIdSet.add(interview.fathom_recording_id);
      }
    });

    // 2. Fetch all meetings from all Fathom accounts (Ben + Diego)
    console.log("Backfill: Fetching meetings from all Fathom accounts...");
    const meetings = await fetchAllMeetingsFromAllAccounts({
      includeTranscript: true,
      includeSummary: true,
    });
    console.log(
      `Backfill: Found ${meetings.length} total meetings across all accounts`
    );

    // 3. Process each meeting
    const results = {
      total: meetings.length,
      matched_by_url: 0,
      matched_by_recording_id: 0,
      created_new: 0,
      skipped_no_email: 0,
      skipped_already_processed: 0,
      errors: [] as string[],
    };

    for (const meeting of meetings) {
      try {
        const interviewData = extractInterviewData(meeting);

        // Skip if already processed by recording_id
        if (recordingIdSet.has(meeting.recording_id)) {
          // Still update transcript/summary if missing
          await updateExistingByRecordingId(meeting);
          results.matched_by_recording_id++;
          continue;
        }

        // Try to match by share_url against existing fathom_recording_url
        const matchedId = urlToInterviewId.get(meeting.share_url);
        if (matchedId) {
          await updateExistingInterview(matchedId, meeting);
          results.matched_by_url++;
          recordingIdSet.add(meeting.recording_id);
          continue;
        }

        // No existing match -- resolve customer (find or create) and link booking
        if (!interviewData.interviewee_email) {
          results.skipped_no_email++;
          continue;
        }

        const { customerId, cohortStatuses, bookingId } =
          await resolveCustomerAndBooking(
            interviewData.interviewee_email,
            interviewData.interviewee_name
          );

        const cohort = deriveCohort(cohortStatuses);

        const result = await upsertInterview(
          interviewData,
          customerId,
          cohort,
          bookingId
        );
        if (result.action === "created") {
          results.created_new++;
        }
        recordingIdSet.add(meeting.recording_id);
      } catch (err) {
        results.errors.push(
          `Recording ${meeting.recording_id}: ${String(err)}`
        );
      }
    }

    console.log("Backfill complete:", results);

    const durationMs = Date.now() - startTime;
    await logToSystemLogs("success", 200, durationMs, {
      total: results.total,
      matched_by_url: results.matched_by_url,
      matched_by_recording_id: results.matched_by_recording_id,
      created_new: results.created_new,
      skipped_no_email: results.skipped_no_email,
      error_count: results.errors.length,
    });

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Fathom backfill error:", msg);
    await logToSystemLogs("error", 500, durationMs, {}, msg);
    return new Response(
      JSON.stringify({ error: "Backfill failed", details: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
