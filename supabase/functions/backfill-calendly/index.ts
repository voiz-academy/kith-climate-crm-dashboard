import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- CONFIG ----------------------------------------------------------------
// Default cohort — only used for customers with no cohort_statuses.
// Existing customers derive cohort from their most recent cohort_statuses entry.
const DEFAULT_COHORT = "May 18th 2026";
const DEFAULT_LOOKBACK_DAYS = 14;

// Only these Calendly event names are relevant for Kith Climate interviews
const ALLOWED_EVENT_NAMES = ["Kith Climate Cohort Interview"];

function isAllowedEvent(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  return ALLOWED_EVENT_NAMES.some((a) => a.toLowerCase().trim() === lower);
}

// --- COHORT DERIVATION -----------------------------------------------------

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

// --- CALENDLY API HELPERS --------------------------------------------------

interface CalendlyEvent {
  uri: string;
  name: string;
  start_time: string;
  end_time: string;
  status: string;
  location?: {
    type?: string;
    kind?: string;
    join_url?: string;
    location?: string;
  };
  event_memberships: Array<{
    user_name: string;
    user_email: string;
  }>;
}

interface CalendlyInvitee {
  uri: string;
  email: string;
  name: string;
  canceled: boolean;
  cancellation?: { reason?: string };
  created_at: string;
}

async function calendlyGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendly API ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchUserOrg(token: string) {
  const data = await calendlyGet("https://api.calendly.com/users/me", token);
  return {
    userUri: data.resource.uri as string,
    orgUri: data.resource.current_organization as string,
  };
}

async function fetchScheduledEvents(
  token: string, orgUri: string, minTime: string, maxTime: string
): Promise<CalendlyEvent[]> {
  const all: CalendlyEvent[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL("https://api.calendly.com/scheduled_events");
    url.searchParams.set("organization", orgUri);
    url.searchParams.set("min_start_time", minTime);
    url.searchParams.set("max_start_time", maxTime);
    url.searchParams.set("count", "100");
    url.searchParams.set("status", "active");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const data = await calendlyGet(url.toString(), token);
    all.push(...(data.collection as CalendlyEvent[]));
    pageToken = data.pagination?.next_page_token || null;
  } while (pageToken);

  pageToken = null;
  do {
    const url = new URL("https://api.calendly.com/scheduled_events");
    url.searchParams.set("organization", orgUri);
    url.searchParams.set("min_start_time", minTime);
    url.searchParams.set("max_start_time", maxTime);
    url.searchParams.set("count", "100");
    url.searchParams.set("status", "canceled");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const data = await calendlyGet(url.toString(), token);
    all.push(...(data.collection as CalendlyEvent[]));
    pageToken = data.pagination?.next_page_token || null;
  } while (pageToken);

  return all;
}

async function fetchEventInvitees(token: string, eventUri: string): Promise<CalendlyInvitee[]> {
  const uuid = eventUri.split("/").pop();
  const data = await calendlyGet(`https://api.calendly.com/scheduled_events/${uuid}/invitees`, token);
  return data.collection as CalendlyInvitee[];
}

// --- SYSTEM LOGS -----------------------------------------------------------

async function logToSystemLogs(
  supabase: ReturnType<typeof createClient>,
  status: "success" | "error", statusCode: number, durationMs: number,
  metadata: Record<string, unknown> = {}, errorMessage?: string
) {
  try {
    await supabase.from("system_logs").insert({
      function_name: "backfill-calendly", function_type: "edge_function",
      http_method: "POST", status, status_code: statusCode,
      duration_ms: durationMs, error_message: errorMessage || null,
      metadata, invoked_at: new Date().toISOString(),
    });
  } catch (e) { console.error("Failed to write system_logs:", e); }
}

// --- MAIN ------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const calendlyToken = Deno.env.get("CALENDLY_API_TOKEN");

  if (!calendlyToken) {
    return new Response(
      JSON.stringify({ error: "CALENDLY_API_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "kith_climate" },
  });

  try {
    let lookbackDays = DEFAULT_LOOKBACK_DAYS;
    try {
      if (req.method === "POST") {
        const body = await req.json();
        if (body?.lookback_days && typeof body.lookback_days === "number") {
          lookbackDays = Math.min(body.lookback_days, 90);
        }
      }
    } catch { /* no body or invalid JSON */ }

    const now = new Date();
    const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const minTime = since.toISOString();
    const maxTime = now.toISOString();

    console.log(`Backfill: fetching Calendly events from ${minTime} to ${maxTime} (${lookbackDays} days)`);

    const { orgUri } = await fetchUserOrg(calendlyToken);
    console.log(`Organization: ${orgUri}`);

    const events = await fetchScheduledEvents(calendlyToken, orgUri, minTime, maxTime);
    console.log(`Calendly returned ${events.length} total events`);

    const relevantEvents = events.filter((e) => isAllowedEvent(e.name));
    console.log(`${relevantEvents.length} events match allowed names`);

    const { data: existingBookings, error: fetchErr } = await supabase
      .from("interviews_booked").select("calendly_event_uri").not("calendly_event_uri", "is", null);

    if (fetchErr) throw new Error(`Failed to fetch existing bookings: ${fetchErr.message}`);

    const existingUris = new Set(
      (existingBookings || []).map((b: { calendly_event_uri: string }) => b.calendly_event_uri)
    );
    console.log(`${existingUris.size} existing bookings with calendly_event_uri`);

    let inserted = 0;
    let skippedDupe = 0;
    let skippedNoCustomer = 0;
    let cancelUpdated = 0;
    const insertedRecords: Array<{ email: string; name: string; scheduled_at: string }> = [];
    const errors: string[] = [];

    for (const event of relevantEvents) {
      const eventUri = event.uri;

      let invitees: CalendlyInvitee[];
      try {
        invitees = await fetchEventInvitees(calendlyToken, eventUri);
      } catch (e) {
        errors.push(`Failed to fetch invitees for ${eventUri}: ${e}`);
        continue;
      }

      for (const invitee of invitees) {
        const email = invitee.email?.toLowerCase();
        if (!email) continue;

        if (!invitee.canceled) {
          if (existingUris.has(eventUri)) { skippedDupe++; continue; }

          // Find customer — include cohort_statuses for cohort derivation
          const { data: customer } = await supabase
            .from("customers")
            .select("id, cohort_statuses")
            .eq("email", email)
            .single();

          if (!customer) {
            console.log(`No customer for ${email} - skipping`);
            skippedNoCustomer++;
            continue;
          }

          const cohort = deriveCohort(customer.cohort_statuses);
          const loc = event.location || {};
          const locationType = loc.type || loc.kind || null;
          const locationUrl = loc.join_url || loc.location || null;
          const interviewer = event.event_memberships?.[0];

          const { error: insErr } = await supabase.from("interviews_booked").insert({
            customer_id: customer.id,
            calendly_event_uri: eventUri,
            calendly_invitee_uri: invitee.uri,
            scheduled_at: event.start_time,
            interviewer_name: interviewer?.user_name || null,
            interviewer_email: interviewer?.user_email || null,
            event_type: event.name,
            location_type: locationType,
            location_url: locationUrl,
            interviewee_name: invitee.name,
            interviewee_email: email,
            cohort: cohort,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          if (insErr) {
            errors.push(`Insert failed for ${email}: ${insErr.message}`);
          } else {
            inserted++;
            existingUris.add(eventUri);
            insertedRecords.push({ email, name: invitee.name, scheduled_at: event.start_time });
          }
        } else {
          if (!existingUris.has(eventUri)) continue;

          const { error: updErr } = await supabase
            .from("interviews_booked")
            .update({
              cancelled_at: new Date().toISOString(),
              cancel_reason: invitee.cancellation?.reason || null,
              updated_at: new Date().toISOString(),
            })
            .eq("calendly_event_uri", eventUri)
            .is("cancelled_at", null);

          if (updErr) {
            errors.push(`Cancel update failed for ${eventUri}: ${updErr.message}`);
          } else {
            cancelUpdated++;
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const summary = {
      lookback_days: lookbackDays,
      date_range: { from: minTime, to: maxTime },
      total_calendly_events: events.length,
      relevant_events: relevantEvents.length,
      existing_bookings: existingUris.size - inserted,
      inserted, skipped_duplicate: skippedDupe,
      skipped_no_customer: skippedNoCustomer,
      cancel_updated: cancelUpdated,
      errors: errors.length,
    };

    console.log("Backfill complete:", JSON.stringify(summary));
    await logToSystemLogs(supabase, "success", 200, durationMs, {
      ...summary, inserted_records: insertedRecords,
      ...(errors.length > 0 ? { error_details: errors } : {}),
    });

    return new Response(
      JSON.stringify({ success: true, summary, inserted_records: insertedRecords, ...(errors.length > 0 ? { errors } : {}) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Backfill error:", msg);
    await logToSystemLogs(supabase, "error", 500, durationMs, {}, msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
