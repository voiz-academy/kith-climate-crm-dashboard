import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Config ---

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY")!;
const LUMA_BASE_URL = "https://api.lu.ma/public/v1";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: "kith_climate" },
});

// --- Luma API types ---

interface LumaGuest {
  api_id: string;
  approval_status: string;
  checked_in_at: string | null;
  joined_at: string | null;  // virtual attendance (joined Zoom/event link)
  registered_at: string;
  user_email: string | null;
  user_name: string | null;
}

interface LumaGuestEntry {
  api_id: string;
  guest: LumaGuest;
}

interface LumaGuestsResponse {
  entries: LumaGuestEntry[];
  has_more: boolean;
  next_cursor: string | null;
}

// --- Luma client ---

async function fetchEventGuests(eventApiId: string): Promise<LumaGuest[]> {
  const guests: LumaGuest[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${LUMA_BASE_URL}/event/get-guests`);
    url.searchParams.set("event_api_id", eventApiId);
    if (cursor) url.searchParams.set("pagination_cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: {
        "x-luma-api-key": LUMA_API_KEY,
        "accept": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Luma API ${res.status} for ${eventApiId}: ${body}`);
    }

    const data = (await res.json()) as LumaGuestsResponse;
    for (const entry of data.entries) {
      guests.push(entry.guest);
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return guests;
}

// --- Handler ---

interface BackfillResult {
  event_api_id: string;
  event_date: string;
  guests_from_luma: number;
  registrations_in_db: number;
  matched: number;
  attendance_set: number;
  attendance_already_correct: number;
  attendance_unmatched_guests: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Optional ?event_api_id=evt-... to backfill a single event; otherwise all distinct events.
  // Optional ?include_future=true to include events whose event_date >= today (default: only past).
  const url = new URL(req.url);
  const singleEvent = url.searchParams.get("event_api_id");
  const includeFuture = url.searchParams.get("include_future") === "true";

  // Build the list of events to process.
  let eventsToProcess: { luma_event_id: string; event_date: string }[];

  if (singleEvent) {
    const { data, error } = await supabase
      .from("workshop_registrations")
      .select("luma_event_id, event_date")
      .eq("luma_event_id", singleEvent)
      .limit(1);
    if (error) return new Response(`DB error: ${error.message}`, { status: 500 });
    eventsToProcess = (data ?? []).map((r) => ({
      luma_event_id: r.luma_event_id as string,
      event_date: r.event_date as string,
    }));
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("workshop_registrations")
      .select("luma_event_id, event_date")
      .not("luma_event_id", "is", null);
    if (error) return new Response(`DB error: ${error.message}`, { status: 500 });

    // Distinct (luma_event_id, event_date) pairs
    const seen = new Set<string>();
    eventsToProcess = [];
    for (const row of data ?? []) {
      const id = row.luma_event_id as string;
      const date = row.event_date as string;
      if (!includeFuture && date >= today) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      eventsToProcess.push({ luma_event_id: id, event_date: date });
    }
  }

  const results: BackfillResult[] = [];

  for (const evt of eventsToProcess) {
    const result: BackfillResult = {
      event_api_id: evt.luma_event_id,
      event_date: evt.event_date,
      guests_from_luma: 0,
      registrations_in_db: 0,
      matched: 0,
      attendance_set: 0,
      attendance_already_correct: 0,
      attendance_unmatched_guests: 0,
      errors: [],
    };

    try {
      // Pull guests from Luma
      const lumaGuests = await fetchEventGuests(evt.luma_event_id);
      result.guests_from_luma = lumaGuests.length;

      // Pull current registrations from DB.
      // Paginate to bypass Supabase default 1000-row limit
      // (large events like Feb 26 have ~1857 registrations).
      type RegRow = { id: string; source_api_id: string; attended: boolean; checked_in_at: string | null };
      const PAGE = 1000;
      const regs: RegRow[] = [];
      let from = 0;
      while (true) {
        const { data, error: regsErr } = await supabase
          .from("workshop_registrations")
          .select("id, source_api_id, attended, checked_in_at")
          .eq("luma_event_id", evt.luma_event_id)
          .range(from, from + PAGE - 1);
        if (regsErr) throw regsErr;
        if (!data || data.length === 0) break;
        regs.push(...(data as RegRow[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      result.registrations_in_db = regs.length;

      const regBySourceId = new Map<string, { id: string; attended: boolean; checked_in_at: string | null }>();
      for (const r of regs) {
        regBySourceId.set(r.source_api_id as string, {
          id: r.id as string,
          attended: r.attended as boolean,
          checked_in_at: r.checked_in_at as string | null,
        });
      }

      // For each Luma guest, decide if we need to update the matching registration.
      const updates: { id: string; attended: boolean; checked_in_at: string | null }[] = [];
      for (const guest of lumaGuests) {
        const reg = regBySourceId.get(guest.api_id);
        if (!reg) {
          result.attendance_unmatched_guests++;
          continue;
        }
        result.matched++;

        // Use joined_at (virtual attendance via Zoom link) OR checked_in_at (physical QR).
        const attendedTimestamp = guest.joined_at ?? guest.checked_in_at;
        const shouldAttend = attendedTimestamp != null;

        // ADDITIVE ONLY: never clear attended=true. If the DB already says
        // attended but Luma doesn't confirm, keep existing (may be from CSV).
        if (reg.attended && !shouldAttend) {
          result.attendance_already_correct++;
          continue;
        }
        if (reg.attended === shouldAttend && reg.checked_in_at === attendedTimestamp) {
          result.attendance_already_correct++;
          continue;
        }
        updates.push({ id: reg.id, attended: shouldAttend, checked_in_at: attendedTimestamp });
      }

      // Batch updates (one row at a time — Supabase upsert by id is the simplest path)
      for (const u of updates) {
        const { error: updErr } = await supabase
          .from("workshop_registrations")
          .update({
            attended: u.attended,
            checked_in_at: u.checked_in_at,
            updated_at: new Date().toISOString(),
          })
          .eq("id", u.id);
        if (updErr) {
          result.errors.push(`update ${u.id}: ${updErr.message}`);
        } else {
          result.attendance_set++;
        }
      }
    } catch (e) {
      result.errors.push(String(e));
    }

    results.push(result);
  }

  // Aggregate summary
  const summary = {
    events_processed: results.length,
    total_guests_from_luma: results.reduce((s, r) => s + r.guests_from_luma, 0),
    total_registrations_in_db: results.reduce((s, r) => s + r.registrations_in_db, 0),
    total_matched: results.reduce((s, r) => s + r.matched, 0),
    total_attendance_set: results.reduce((s, r) => s + r.attendance_set, 0),
    total_unmatched_guests: results.reduce((s, r) => s + r.attendance_unmatched_guests, 0),
    total_errors: results.reduce((s, r) => s + r.errors.length, 0),
  };

  return new Response(
    JSON.stringify({ summary, per_event: results }, null, 2),
    { headers: { "content-type": "application/json" } }
  );
});
