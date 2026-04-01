import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const calendlyToken = Deno.env.get("CALENDLY_API_TOKEN")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: "kith_climate" },
});

// --- DEFAULT COHORT (used for new customers with no existing cohort entry) ---
const DEFAULT_COHORT = "May 18th 2026";

// --- EVENT NAME ALLOWLIST ---------------------------------------------------
const ALLOWED_EVENT_NAMES: string[] = [
  "Kith Climate Cohort Interview",
];

function isAllowedEvent(eventName: string | null | undefined): boolean {
  if (!eventName) return false;
  const lower = eventName.toLowerCase().trim();
  return ALLOWED_EVENT_NAMES.some((name) => name.toLowerCase().trim() === lower);
}

// --- SYSTEM LOGS ------------------------------------------------------------
async function logToSystemLogs(
  status: "success" | "error",
  statusCode: number,
  durationMs: number,
  metadata: Record<string, unknown> = {},
  errorMessage?: string
) {
  try {
    await supabase.from("system_logs").insert({
      function_name: "calendly-webhook",
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

// --- CALENDLY API HELPERS ---------------------------------------------------

async function fetchCalendlyEvent(eventUri: string) {
  const res = await fetch(eventUri, {
    headers: { Authorization: `Bearer ${calendlyToken}` },
  });
  if (!res.ok) {
    console.error(`Failed to fetch event ${eventUri}: ${res.status}`);
    return null;
  }
  const data = await res.json();
  return data.resource;
}

async function fetchCalendlyInvitee(inviteeUri: string) {
  const res = await fetch(inviteeUri, {
    headers: { Authorization: `Bearer ${calendlyToken}` },
  });
  if (!res.ok) {
    console.error(`Failed to fetch invitee ${inviteeUri}: ${res.status}`);
    return null;
  }
  const data = await res.json();
  return data.resource;
}

async function findCustomerByEmail(email: string) {
  const { data } = await supabase
    .from("customers")
    .select("id, cohort_statuses")
    .eq("email", email.toLowerCase())
    .single();
  return data;
}

/**
 * Determine the cohort for a booking.
 * If the customer already has cohort_statuses, use the most recently updated entry.
 * Otherwise fall back to DEFAULT_COHORT.
 */
function determineCohort(
  cohortStatuses: Record<string, { status: string; updated_at: string }> | null
): string {
  if (!cohortStatuses) return DEFAULT_COHORT;

  const entries = Object.entries(cohortStatuses);
  if (entries.length === 0) return DEFAULT_COHORT;

  // Pick the cohort with the most recent updated_at
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

async function createCustomerFromCalendly(email: string, name: string) {
  const nameParts = (name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || null;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  const { data, error } = await supabase
    .from("customers")
    .insert({
      email: email.toLowerCase(),
      first_name: firstName,
      last_name: lastName,
      funnel_status: "booked",
      lead_type: "unknown",
      enrichment_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create customer:", error);
    return null;
  }

  console.log(`Created new customer ${data.id} for ${email} (${name})`);
  return data;
}

// --- MAIN -------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const startTime = Date.now();

  try {
    const payload = await req.json();
    const { event: eventType, payload: eventPayload } = payload;

    console.log(`Received Calendly webhook: ${eventType}`);

    // -- INVITEE CREATED ------------------------------------------------------
    if (eventType === "invitee.created") {
      const inviteeUri = eventPayload.uri;
      const eventUri = eventPayload.event;
      const inviteeEmail = eventPayload.email?.toLowerCase();
      const inviteeName = eventPayload.name;

      // Fetch full event and invitee details
      const [eventDetails, inviteeDetails] = await Promise.all([
        fetchCalendlyEvent(eventUri),
        fetchCalendlyInvitee(inviteeUri),
      ]);

      const eventName = eventDetails?.name || eventDetails?.event_type?.name || null;

      // -- ALLOWLIST CHECK --
      if (!isAllowedEvent(eventName)) {
        console.log(
          `Skipping event "${eventName}" for ${inviteeEmail} -- not in allowlist`
        );
        const durationMs = Date.now() - startTime;
        await logToSystemLogs("success", 200, durationMs, {
          action: "skipped",
          reason: "event_name_not_allowed",
          event_name: eventName,
          invitee_email: inviteeEmail,
        });
        return new Response(
          JSON.stringify({
            status: "skipped",
            reason: "event_name_not_allowed",
            event_name: eventName,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Find or create the customer
      let customer = await findCustomerByEmail(inviteeEmail);
      let customerCreated = false;
      let cohort = DEFAULT_COHORT;

      if (!customer) {
        console.log(`No existing customer for ${inviteeEmail} — creating new customer`);
        customer = await createCustomerFromCalendly(inviteeEmail, inviteeName);
        customerCreated = true;

        if (!customer) {
          console.error(`Failed to create customer for ${inviteeEmail}`);
          const durationMs = Date.now() - startTime;
          await logToSystemLogs("error", 500, durationMs, {
            action: "customer_create_failed",
            invitee_email: inviteeEmail,
            event_name: eventName,
          }, "Failed to create new customer record");
          return new Response(
            JSON.stringify({ status: "error", reason: "customer_create_failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      } else {
        // Existing customer — derive cohort from their cohort_statuses
        cohort = determineCohort(customer.cohort_statuses);
      }

      // Extract location info
      const location = eventDetails?.location || {};
      const locationType = location.type || location.kind || null;
      const locationUrl = location.join_url || location.location || null;

      // Check for existing booking (deduplicate)
      const { data: existing } = await supabase
        .from("interviews_booked")
        .select("id")
        .eq("calendly_event_uri", eventUri)
        .single();

      if (existing) {
        console.log(`Booking already exists for event: ${eventUri}`);
        const durationMs = Date.now() - startTime;
        await logToSystemLogs("success", 200, durationMs, {
          action: "skipped",
          reason: "duplicate",
          invitee_email: inviteeEmail,
          calendly_event_uri: eventUri,
        });
        return new Response(
          JSON.stringify({ status: "skipped", reason: "duplicate" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Insert the booking
      // The DB trigger (trg_interview_booked_sync) will call advance_funnel()
      const { error } = await supabase.from("interviews_booked").insert({
        customer_id: customer.id,
        calendly_event_uri: eventUri,
        calendly_invitee_uri: inviteeUri,
        scheduled_at: eventDetails?.start_time || new Date().toISOString(),
        interviewer_name:
          eventDetails?.event_memberships?.[0]?.user_name || null,
        interviewer_email:
          eventDetails?.event_memberships?.[0]?.user_email || null,
        event_type: eventName,
        location_type: locationType,
        location_url: locationUrl,
        interviewee_name: inviteeName,
        interviewee_email: inviteeEmail,
        cohort: cohort,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Insert error:", error);
        const durationMs = Date.now() - startTime;
        await logToSystemLogs("error", 500, durationMs, {
          action: "insert_failed",
          invitee_email: inviteeEmail,
          calendly_event_uri: eventUri,
        }, error.message);
        return new Response(
          JSON.stringify({ status: "error", error: error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log(`Booking created for ${inviteeEmail} (${eventName}) [cohort: ${cohort}]${customerCreated ? " [new customer]" : ""}`);
      const durationMs = Date.now() - startTime;
      await logToSystemLogs("success", 200, durationMs, {
        action: "created",
        invitee_email: inviteeEmail,
        invitee_name: inviteeName,
        event_name: eventName,
        calendly_event_uri: eventUri,
        customer_id: customer.id,
        customer_created: customerCreated,
        cohort: cohort,
      });
      return new Response(JSON.stringify({ status: "created", customer_created: customerCreated, cohort }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    // -- INVITEE CANCELED -----------------------------------------------------
    } else if (eventType === "invitee.canceled") {
      const eventUri = eventPayload.event;
      const cancelReason = eventPayload.cancellation?.reason || null;
      const inviteeEmail = eventPayload.email?.toLowerCase();

      const { error } = await supabase
        .from("interviews_booked")
        .update({
          cancelled_at: new Date().toISOString(),
          cancel_reason: cancelReason,
          updated_at: new Date().toISOString(),
        })
        .eq("calendly_event_uri", eventUri);

      if (error) {
        console.error("Update error:", error);
        const durationMs = Date.now() - startTime;
        await logToSystemLogs("error", 500, durationMs, {
          action: "cancel_update_failed",
          calendly_event_uri: eventUri,
          invitee_email: inviteeEmail,
        }, error.message);
        return new Response(
          JSON.stringify({ status: "error", error: error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log(`Booking cancelled for event: ${eventUri}`);
      const durationMs = Date.now() - startTime;
      await logToSystemLogs("success", 200, durationMs, {
        action: "cancelled",
        calendly_event_uri: eventUri,
        invitee_email: inviteeEmail,
        cancel_reason: cancelReason,
      });
      return new Response(JSON.stringify({ status: "cancelled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Unknown event type
    const durationMs = Date.now() - startTime;
    await logToSystemLogs("success", 200, durationMs, {
      action: "ignored",
      event_type: eventType,
    });
    return new Response(
      JSON.stringify({ status: "ignored", event: eventType }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Webhook error:", msg);
    await logToSystemLogs("error", 500, durationMs, {}, msg);
    return new Response(
      JSON.stringify({ status: "error", message: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
