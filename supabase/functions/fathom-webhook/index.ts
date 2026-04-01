import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CONFIG ────────────────────────────────────────────────────────────────

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: "kith_climate" },
});

const FATHOM_BASE_URL = "https://api.fathom.ai/external/v1";

// Default cohort — only used for brand-new customers with no cohort_statuses.
// Existing customers derive cohort from their most recent cohort_statuses entry.
const DEFAULT_COHORT = "May 18th 2026";

// Interviewer email-to-name mapping
const INTERVIEWER_MAP: Record<string, string> = {
  "benh@voiz.academy": "Ben Hillier",
  "ben@kithailab.com": "Ben Hillier",
  "diego@voiz.academy": "Diego Espinosa",
  "diego@kithailab.com": "Diego Espinosa",
};

// Internal email domains — meetings with ONLY these domains are skipped
const INTERNAL_DOMAINS = new Set([
  "voiz.academy",
  "kithailab.com",
  "kithclimate.com",
]);

// Known interviewer emails (used to identify the interviewer vs co-worker)
const INTERVIEWER_EMAILS = new Set([
  "benh@voiz.academy",
  "ben@kithailab.com",
  "diego@voiz.academy",
  "diego@kithailab.com",
]);

const log = (step: string, details?: Record<string, unknown>) => {
  const d = details ? ` — ${JSON.stringify(details)}` : "";
  console.log(`[fathom-webhook] ${step}${d}`);
};

const json = (obj: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// ── COHORT DERIVATION ─────────────────────────────────────────────────────

type CohortStatuses = Record<string, { status: string; updated_at: string }> | null;

function deriveCohort(cohortStatuses: CohortStatuses): string {
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

// ── FATHOM API TYPES ──────────────────────────────────────────────────────

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

interface FathomAccount {
  apiKey: string;
  email: string;
  name: string;
}

// ── Classification result types ───────────────────────────────────────────

type ClassificationResult =
  | { action: "auto_insert"; reason: string; confidence: number }
  | { action: "flag_for_review"; reason: string; confidence: number }
  | { action: "skip"; reason: string };

// ── API KEY MANAGEMENT ────────────────────────────────────────────────────

function getApiKeys(): FathomAccount[] {
  const accounts: FathomAccount[] = [];

  const benKey = Deno.env.get("FATHOM_API_KEY");
  if (benKey) {
    accounts.push({ apiKey: benKey, email: "ben@kithailab.com", name: "Ben Hillier" });
  }

  const diegoKey = Deno.env.get("FATHOM_API_KEY_DIEGO");
  if (diegoKey) {
    accounts.push({ apiKey: diegoKey, email: "diego@kithailab.com", name: "Diego Espinosa" });
  }

  if (accounts.length === 0) {
    throw new Error("No FATHOM_API_KEY environment variables are set");
  }

  return accounts;
}

// ── MEETING CLASSIFICATION (v12 — enhanced filtering) ─────────────────────

function classifyMeeting(meeting: FathomMeeting): ClassificationResult {
  const invitees = meeting.calendar_invitees || [];
  const recorderEmail = meeting.recorded_by?.email?.toLowerCase() || "";

  if (invitees.length === 0) {
    return { action: "skip", reason: "no_calendar_invitees" };
  }

  const externalInvitees: FathomCalendarInvitee[] = [];
  const internalCoWorkers: FathomCalendarInvitee[] = [];

  for (const inv of invitees) {
    const invEmail = inv.email?.toLowerCase() || "";
    const invDomain = inv.email_domain?.toLowerCase() || "";

    if (invEmail === recorderEmail) continue;

    const definitelyInternal = INTERNAL_DOMAINS.has(invDomain);

    if (definitelyInternal) {
      internalCoWorkers.push(inv);
    } else if (inv.is_external || (invDomain && !INTERNAL_DOMAINS.has(invDomain))) {
      externalInvitees.push(inv);
    } else {
      internalCoWorkers.push(inv);
    }
  }

  if (internalCoWorkers.length > 0) {
    return { action: "skip", reason: "has_internal_coworker" };
  }

  if (externalInvitees.length === 0) {
    return { action: "skip", reason: "all_invitees_internal" };
  }

  if (externalInvitees.length > 1) {
    return { action: "skip", reason: "multiple_external_invitees" };
  }

  if (invitees.length > 2) {
    return { action: "skip", reason: "more_than_two_attendees" };
  }

  const confidence = analyzeTranscriptConfidence(meeting);

  if (confidence.score >= 0.7) {
    return { action: "auto_insert", reason: confidence.reason, confidence: confidence.score };
  }

  return { action: "flag_for_review", reason: confidence.reason, confidence: confidence.score };
}

function analyzeTranscriptConfidence(meeting: FathomMeeting): { score: number; reason: string } {
  const transcript = meeting.transcript;
  const reasons: string[] = [];
  let score = 0.5;

  if (!transcript || transcript.length === 0) {
    return { score: 0.4, reason: "no_transcript_available" };
  }

  if (transcript.length >= 50) { score += 0.15; reasons.push("substantial_transcript"); }
  else if (transcript.length >= 20) { score += 0.1; reasons.push("moderate_transcript"); }
  else if (transcript.length < 5) { score -= 0.2; reasons.push("very_short_transcript"); }

  const fullText = transcript.map(e => e.text).join(" ").toLowerCase();
  const interviewKeywords = [
    "application", "cohort", "climate", "background", "experience",
    "role", "motivation", "why", "goals", "program", "enrol", "enroll",
    "interview", "kith", "ai lab", "artificial intelligence",
    "machine learning", "career", "transition", "professional",
    "tell me about", "what brings you", "what made you",
  ];

  const matchedKeywords = interviewKeywords.filter(kw => fullText.includes(kw));
  if (matchedKeywords.length >= 5) { score += 0.2; reasons.push("strong_keyword_match"); }
  else if (matchedKeywords.length >= 2) { score += 0.1; reasons.push("moderate_keyword_match"); }
  else { score -= 0.1; reasons.push("weak_keyword_match"); }

  const speakerCounts = new Map<string, number>();
  for (const entry of transcript) {
    const speaker = entry.speaker.display_name;
    speakerCounts.set(speaker, (speakerCounts.get(speaker) || 0) + 1);
  }

  if (speakerCounts.size >= 2) {
    const counts = Array.from(speakerCounts.values()).sort((a, b) => b - a);
    const dominance = counts[0] / transcript.length;
    if (dominance <= 0.75) { score += 0.1; reasons.push("balanced_conversation"); }
    else if (dominance > 0.9) { score -= 0.15; reasons.push("one_speaker_dominates"); }
  } else if (speakerCounts.size === 1) {
    score -= 0.2; reasons.push("only_one_speaker");
  }

  try {
    const start = new Date(meeting.recording_start_time);
    const end = new Date(meeting.recording_end_time);
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    if (durationMinutes >= 15) { score += 0.1; reasons.push("good_duration"); }
    else if (durationMinutes < 5) { score -= 0.15; reasons.push("very_short_duration"); }
  } catch { /* ignore */ }

  if (meeting.default_summary?.markdown_formatted) {
    const summary = meeting.default_summary.markdown_formatted.toLowerCase();
    const summaryKeywords = ["interview", "application", "cohort", "candidate", "climate", "kith"];
    const summaryMatches = summaryKeywords.filter(kw => summary.includes(kw));
    if (summaryMatches.length >= 2) { score += 0.1; reasons.push("summary_confirms_interview"); }
  }

  score = Math.max(0, Math.min(1, score));
  return { score: Math.round(score * 100) / 100, reason: reasons.join(", ") || "baseline_score" };
}

// ── FATHOM API FUNCTIONS ──────────────────────────────────────────────────

async function fathomFetch<T>(path: string, params?: Record<string, string>, apiKey?: string): Promise<T> {
  const url = new URL(`${FATHOM_BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => { url.searchParams.append(key, value); });
  }

  const defaultKey = Deno.env.get("FATHOM_API_KEY");
  if (!apiKey && !defaultKey) throw new Error("No Fathom API key available");

  const response = await fetch(url.toString(), {
    headers: { "X-Api-Key": apiKey || defaultKey!, "Accept": "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fathom API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

async function fetchMeeting(recordingId: number, apiKey?: string): Promise<FathomMeeting> {
  const response = await fathomFetch<FathomMeetingsResponse>("/meetings", {
    "include_transcript": "true", "include_summary": "true",
  }, apiKey);

  let meeting = response.items.find((m) => m.recording_id === recordingId);
  let cursor = response.next_cursor;

  while (!meeting && cursor) {
    const nextPage = await fathomFetch<FathomMeetingsResponse>("/meetings", {
      "include_transcript": "true", "include_summary": "true", "cursor": cursor,
    }, apiKey);
    meeting = nextPage.items.find((m) => m.recording_id === recordingId);
    cursor = nextPage.next_cursor;
  }

  if (!meeting) throw new Error(`Meeting with recording_id ${recordingId} not found`);
  return meeting;
}

async function fetchMeetingFromAnyAccount(recordingId: number): Promise<FathomMeeting> {
  const accounts = getApiKeys();
  for (const account of accounts) {
    try { return await fetchMeeting(recordingId, account.apiKey); } catch { continue; }
  }
  throw new Error(`Meeting with recording_id ${recordingId} not found on any Fathom account`);
}

// ── DATA FORMATTING ───────────────────────────────────────────────────────

function formatTranscript(entries: FathomTranscriptEntry[]): string {
  return entries.map((entry) => `[${entry.timestamp}] ${entry.speaker.display_name}: ${entry.text}`).join("\n");
}

function formatSummary(meeting: FathomMeeting): string | null {
  const parts: string[] = [];
  if (meeting.default_summary?.markdown_formatted) parts.push(meeting.default_summary.markdown_formatted);
  if (meeting.action_items && Array.isArray(meeting.action_items) && meeting.action_items.length > 0) {
    parts.push("\n## Action Items");
    meeting.action_items.forEach((item: unknown) => {
      const desc = (item as { description?: string })?.description || String(item);
      parts.push(`- ${desc}`);
    });
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function extractInterviewee(invitees: FathomCalendarInvitee[]): { name: string | null; email: string | null } {
  const external = invitees.find((inv) => inv.is_external);
  if (!external) return { name: null, email: null };
  return { name: external.name, email: external.email };
}

function extractInterviewData(meeting: FathomMeeting): MappedInterviewData {
  const interviewee = extractInterviewee(meeting.calendar_invitees);
  const interviewerName = INTERVIEWER_MAP[meeting.recorded_by.email] || meeting.recorded_by.name;
  return {
    fathom_recording_id: meeting.recording_id,
    fathom_recording_url: meeting.share_url,
    fathom_summary: formatSummary(meeting),
    transcript: meeting.transcript ? formatTranscript(meeting.transcript) : null,
    interviewee_name: interviewee.name,
    interviewee_email: interviewee.email,
    interviewer: interviewerName,
    conducted_at: meeting.recording_start_time,
    activity_type: "demo",
  };
}

// ── WEBHOOK SIGNATURE VERIFICATION ────────────────────────────────────────

async function verifyWebhookSignature(
  msgId: string, timestamp: string, body: string, signatureHeader: string, secret: string
): Promise<boolean> {
  const secretKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Uint8Array.from(atob(secretKey), (c) => c.charCodeAt(0));

  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    log("Signature check: timestamp out of tolerance", { webhook_ts: ts, server_ts: now, diff_seconds: Math.abs(now - ts) });
    return false;
  }

  const toSign = `${msgId}.${timestamp}.${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(toSign));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const signatures = signatureHeader.split(" ");
  for (const versionedSig of signatures) {
    const commaIdx = versionedSig.indexOf(",");
    if (commaIdx === -1) continue;
    const provided = versionedSig.slice(commaIdx + 1);
    if (computed.length !== provided.length) continue;
    let mismatch = 0;
    for (let i = 0; i < computed.length; i++) {
      mismatch |= computed.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    if (mismatch === 0) return true;
  }
  return false;
}

// ── DATABASE FUNCTIONS ────────────────────────────────────────────────────

async function findOrCreateCustomer(
  email: string, name?: string | null
): Promise<{ customerId: string; created: boolean; cohortStatuses: CohortStatuses }> {
  const normEmail = email.toLowerCase().trim();

  const { data: existing, error: findErr } = await supabase
    .from("customers")
    .select("id, cohort_statuses")
    .eq("email", normEmail)
    .limit(1)
    .single();

  if (existing && !findErr) {
    return { customerId: existing.id, created: false, cohortStatuses: existing.cohort_statuses };
  }

  let firstName: string | null = null;
  let lastName: string | null = null;
  if (name) {
    const parts = name.trim().split(/\s+/);
    firstName = parts[0] || null;
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("customers")
    .insert({
      email: normEmail,
      first_name: firstName,
      last_name: lastName,
      funnel_status: "registered",
      enrichment_status: "pending",
      lead_type: "unknown",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(`Failed to create customer for ${normEmail}: ${insertErr?.message}`);
  }

  return { customerId: inserted.id, created: true, cohortStatuses: null };
}

async function findBookingByEmail(email: string): Promise<string | null> {
  const { data: booking } = await supabase
    .from("interviews_booked")
    .select("id")
    .eq("interviewee_email", email.toLowerCase().trim())
    .is("cancelled_at", null)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .single();
  return booking?.id ?? null;
}

async function findManualInterviewToMerge(email: string, conductedAt: string): Promise<string | null> {
  const normEmail = email.toLowerCase().trim();
  const recordingDate = new Date(conductedAt);
  const dayStart = new Date(Date.UTC(recordingDate.getUTCFullYear(), recordingDate.getUTCMonth(), recordingDate.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(recordingDate.getUTCFullYear(), recordingDate.getUTCMonth(), recordingDate.getUTCDate(), 23, 59, 59, 999));

  const { data: candidates } = await supabase
    .from("interviews")
    .select("id, conducted_at")
    .eq("interviewee_email", normEmail)
    .is("fathom_recording_id", null)
    .gte("conducted_at", dayStart.toISOString())
    .lte("conducted_at", dayEnd.toISOString())
    .order("conducted_at", { ascending: false })
    .limit(1);

  if (candidates && candidates.length > 0) return candidates[0].id;
  return null;
}

async function upsertInterview(
  data: MappedInterviewData,
  customerId: string | null,
  bookingId: string | null,
  cohort: string,
) {
  const fathomFields = {
    fathom_recording_id: data.fathom_recording_id,
    fathom_recording_url: data.fathom_recording_url,
    fathom_summary: data.fathom_summary,
    transcript: data.transcript,
    updated_at: new Date().toISOString(),
  };

  const { data: existingByFathomId } = await supabase
    .from("interviews")
    .select("id")
    .eq("fathom_recording_id", data.fathom_recording_id)
    .limit(1)
    .single();

  if (existingByFathomId) {
    const { error } = await supabase.from("interviews").update(fathomFields).eq("id", existingByFathomId.id);
    if (error) throw new Error(`Failed to update interview ${existingByFathomId.id}: ${error.message}`);
    return { action: "updated_existing" as const, id: existingByFathomId.id };
  }

  if (data.interviewee_email) {
    const manualId = await findManualInterviewToMerge(data.interviewee_email, data.conducted_at);
    if (manualId) {
      const { error } = await supabase.from("interviews").update({
        ...fathomFields, interviewer: data.interviewer, conducted_at: data.conducted_at,
      }).eq("id", manualId);
      if (error) throw new Error(`Failed to merge into manual interview ${manualId}: ${error.message}`);
      return { action: "merged_manual" as const, id: manualId };
    }
  }

  const newRow = {
    customer_id: customerId,
    interviewee_name: data.interviewee_name,
    interviewee_email: data.interviewee_email,
    booking_id: bookingId,
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

  const { data: inserted, error } = await supabase.from("interviews").insert(newRow).select("id").single();
  if (error) throw new Error(`Failed to insert interview: ${error.message}`);
  return { action: "created" as const, id: inserted.id };
}

async function stagePendingInterview(
  meeting: FathomMeeting,
  interviewData: MappedInterviewData,
  classificationReason: string,
  confidenceScore: number,
  cohort: string,
): Promise<{ id: string }> {
  const { data: existing } = await supabase
    .from("pending_interviews")
    .select("id")
    .eq("fathom_recording_id", meeting.recording_id)
    .limit(1)
    .single();

  if (existing) {
    const { error } = await supabase.from("pending_interviews").update({
      fathom_summary: interviewData.fathom_summary,
      transcript: interviewData.transcript,
      classification_reason: classificationReason,
      confidence_score: confidenceScore,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (error) throw new Error(`Failed to update pending interview: ${error.message}`);
    return { id: existing.id };
  }

  const { data: inserted, error } = await supabase.from("pending_interviews").insert({
    fathom_recording_id: meeting.recording_id,
    fathom_recording_url: meeting.share_url,
    fathom_summary: interviewData.fathom_summary,
    transcript: interviewData.transcript,
    interviewee_name: interviewData.interviewee_name,
    interviewee_email: interviewData.interviewee_email,
    interviewer: interviewData.interviewer,
    conducted_at: interviewData.conducted_at,
    activity_type: interviewData.activity_type,
    cohort: cohort,
    meeting_title: meeting.meeting_title || meeting.title,
    calendar_invitees: JSON.parse(JSON.stringify(meeting.calendar_invitees)),
    recorded_by: JSON.parse(JSON.stringify(meeting.recorded_by)),
    classification_reason: classificationReason,
    confidence_score: confidenceScore,
    status: "pending",
  }).select("id").single();

  if (error || !inserted) throw new Error(`Failed to stage pending interview: ${error?.message}`);
  return { id: inserted.id };
}

async function logToSystemLogs(
  functionName: string, status: string, statusCode: number,
  metadata: Record<string, unknown>, startTime: number, errorMessage?: string
) {
  const durationMs = Date.now() - startTime;
  try {
    await supabase.from("system_logs").insert({
      function_name: functionName, function_type: "edge-function", http_method: "POST",
      status, status_code: statusCode, error_message: errorMessage || null,
      duration_ms: durationMs, metadata, invoked_at: new Date().toISOString(),
    });
  } catch (err) { console.error("Failed to write system_log:", err); }
}

const WEBHOOK_ACCOUNT_NAMES = ["ben", "diego"];

// ── MAIN HANDLER ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
      },
    });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const startTime = Date.now();
  let webhookAccount = "unknown";

  try {
    const rawBody = await req.text();
    const webhookId = req.headers.get("webhook-id") || "";
    const webhookTimestamp = req.headers.get("webhook-timestamp") || "";
    const webhookSignature = req.headers.get("webhook-signature") || "";

    log("Webhook headers received", {
      has_webhook_id: !!webhookId, has_webhook_timestamp: !!webhookTimestamp,
      has_webhook_signature: !!webhookSignature,
      signature_preview: webhookSignature ? webhookSignature.slice(0, 10) + "..." : "(empty)",
      body_length: rawBody.length,
    });

    const secrets = [
      Deno.env.get("FATHOM_WEBHOOK_SECRET"),
      Deno.env.get("FATHOM_WEBHOOK_SECRET_DIEGO"),
    ].filter(Boolean) as string[];

    if (secrets.length === 0) {
      log("ERROR: No FATHOM_WEBHOOK_SECRET configured");
      await logToSystemLogs("fathom-webhook", "error", 500, { reason: "no_secret_configured", account: webhookAccount }, startTime, "No FATHOM_WEBHOOK_SECRET configured");
      return json({ error: "Server misconfigured" }, 500);
    }

    let isValid = false;
    let matchedSecretIndex = -1;
    for (let i = 0; i < secrets.length; i++) {
      if (await verifyWebhookSignature(webhookId, webhookTimestamp, rawBody, webhookSignature, secrets[i])) {
        isValid = true;
        matchedSecretIndex = i;
        break;
      }
    }
    if (!isValid) {
      log("Invalid webhook signature", { secrets_tried: secrets.length, webhook_id: webhookId });
      await logToSystemLogs("fathom-webhook", "error", 401, { reason: "invalid_signature", secrets_tried: secrets.length, account: webhookAccount }, startTime, "Invalid webhook signature");
      return json({ error: "Invalid signature" }, 401);
    }

    log("Signature verified", { matched_secret_index: matchedSecretIndex });
    webhookAccount = WEBHOOK_ACCOUNT_NAMES[matchedSecretIndex] || "unknown";

    const payload = JSON.parse(rawBody);
    log("Webhook received", { event: payload.event, recording_id: payload.recording_id });

    if (payload.event !== "new_meeting_content_ready") {
      log("Ignoring event", { event: payload.event });
      await logToSystemLogs("fathom-webhook", "success", 200, { event: payload.event, action: "ignored_event_type", account: webhookAccount }, startTime);
      return json({ status: "ignored", reason: "unhandled event type" });
    }

    const recordingId = payload.recording_id as number;
    if (!recordingId) {
      await logToSystemLogs("fathom-webhook", "error", 400, { reason: "missing_recording_id", account: webhookAccount }, startTime, "Missing recording_id");
      return json({ error: "Missing recording_id" }, 400);
    }

    const meeting = await fetchMeetingFromAnyAccount(recordingId);
    const classification = classifyMeeting(meeting);

    log("Meeting classified", {
      recording_id: recordingId, title: meeting.meeting_title || meeting.title,
      action: classification.action, reason: classification.reason,
      confidence: "confidence" in classification ? classification.confidence : null,
      invitee_count: meeting.calendar_invitees?.length ?? 0,
      domains_type: meeting.calendar_invitees_domains_type,
    });

    if (classification.action === "skip") {
      await logToSystemLogs("fathom-webhook", "success", 200, {
        action: "skipped_non_interview", recording_id: recordingId,
        title: meeting.meeting_title || meeting.title, reason: classification.reason,
        invitee_count: meeting.calendar_invitees?.length ?? 0, account: webhookAccount,
      }, startTime);
      return json({ status: "skipped", reason: classification.reason, recording_id: recordingId, title: meeting.meeting_title || meeting.title });
    }

    const interviewData = extractInterviewData(meeting);

    // Resolve customer and derive cohort
    let customerId: string | null = null;
    let customerCreated = false;
    let cohort = DEFAULT_COHORT;

    if (interviewData.interviewee_email) {
      const result = await findOrCreateCustomer(interviewData.interviewee_email, interviewData.interviewee_name);
      customerId = result.customerId;
      customerCreated = result.created;
      cohort = deriveCohort(result.cohortStatuses);
      log("Customer resolved", { customerId, created: customerCreated, cohort });
    } else {
      log("No interviewee email found — skipping customer resolution");
    }

    // FLAG FOR REVIEW
    if (classification.action === "flag_for_review") {
      const pending = await stagePendingInterview(meeting, interviewData, classification.reason, classification.confidence, cohort);

      log("Staged for review", {
        pending_id: pending.id, recording_id: recordingId,
        interviewee: interviewData.interviewee_name, confidence: classification.confidence,
        reason: classification.reason,
      });

      const responseData = {
        status: "pending_review", pending_interview_id: pending.id,
        recording_id: recordingId, interviewee: interviewData.interviewee_name,
        confidence: classification.confidence, reason: classification.reason,
      };

      await logToSystemLogs("fathom-webhook", "success", 200, { ...responseData, account: webhookAccount }, startTime);
      return json(responseData);
    }

    // AUTO INSERT
    log("Auto-inserting interview", {
      recording_id: recordingId, interviewee_email: interviewData.interviewee_email,
      interviewee_name: interviewData.interviewee_name, interviewer: interviewData.interviewer,
      confidence: classification.confidence,
    });

    let bookingId: string | null = null;
    if (interviewData.interviewee_email) {
      bookingId = await findBookingByEmail(interviewData.interviewee_email);
      if (bookingId) log("Booking matched", { bookingId });
    }

    const result = await upsertInterview(interviewData, customerId, bookingId, cohort);

    log("Processed", {
      action: result.action, interview_id: result.id, recording_id: recordingId,
      interviewee: interviewData.interviewee_name, interviewer: interviewData.interviewer,
      customer_created: customerCreated, booking_linked: !!bookingId,
      confidence: classification.confidence, cohort,
    });

    const responseData = {
      status: "ok", action: result.action, interview_id: result.id,
      interviewee: interviewData.interviewee_name, interviewer: interviewData.interviewer,
      customer_id: customerId, customer_created: customerCreated,
      booking_linked: !!bookingId, confidence: classification.confidence, cohort,
    };

    await logToSystemLogs("fathom-webhook", "success", 200, { ...responseData, account: webhookAccount }, startTime);
    return json(responseData);
  } catch (error) {
    log("Error", { error: String(error) });
    await logToSystemLogs("fathom-webhook", "error", 500, { error: String(error), account: webhookAccount }, startTime, String(error));
    return json({ error: "Internal server error", details: String(error) }, 500);
  }
});
