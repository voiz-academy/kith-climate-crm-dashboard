/**
 * kith-climate-getresponse-sync
 *
 * Pushes kith_climate.customers into the GetResponse "Lead Gen (live)" campaign.
 *
 * Two modes:
 *   1. "single" (default) — called by INSERT trigger on customers.
 *      Payload: { type: "INSERT", record: { id, email, first_name, last_name, unsubscribed } }
 *
 *   2. "bulk" — backfill or manual resync. SELF-RECURSES until done so
 *      the chain runs entirely on Supabase (no client loop required).
 *      Payload: { mode: "bulk", batch_size?: number, offset?: number, no_recurse?: boolean }
 *
 * Skips: contacts with no email, contacts with `"all"` or `"bounced"` in unsubscribed.
 * Duplication: GR returns 409 for existing contacts — counted as duplicate, not error.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GETRESPONSE_API_KEY = Deno.env.get("KITHCLIMATE_GETRESPONSE_API_KEY")!;
const CAMPAIGN_ID = "jbrFF"; // "Lead Gen (live)"
const SELF_URL = `${SUPABASE_URL}/functions/v1/kith-climate-getresponse-sync`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "kith_climate" },
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function skipReason(unsubs: string[] | null): string | null {
  if (!Array.isArray(unsubs)) return null;
  if (unsubs.includes("all")) return "unsubscribed=all";
  if (unsubs.includes("bounced")) return "unsubscribed=bounced";
  return null;
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

type SyncOutcome = "synced" | "duplicate" | "skipped" | "error";

async function pushContact(c: {
  email: string;
  first_name: string | null;
  last_name: string | null;
  unsubscribed: string[] | null;
}): Promise<{ outcome: SyncOutcome; detail?: string }> {
  if (!c.email) return { outcome: "skipped", detail: "no email" };
  const reason = skipReason(c.unsubscribed);
  if (reason) return { outcome: "skipped", detail: reason };

  const body: Record<string, unknown> = {
    email: c.email,
    campaign: { campaignId: CAMPAIGN_ID },
  };
  const name = fullName(c.first_name, c.last_name);
  if (name) body.name = name;

  try {
    const resp = await fetch("https://api.getresponse.com/v3/contacts", {
      method: "POST",
      headers: {
        "X-Auth-Token": `api-key ${GETRESPONSE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 202) return { outcome: "synced" };
    if (resp.status === 409) return { outcome: "duplicate" };

    const errBody = await resp.text();
    return { outcome: "error", detail: `${resp.status}: ${errBody}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { outcome: "error", detail: msg };
  }
}

async function handleSingle(payload: {
  type: string;
  record: Record<string, unknown>;
}): Promise<Response> {
  const { record } = payload;
  if (!record?.email) return json({ skipped: true, reason: "no email" });

  const result = await pushContact({
    email: record.email as string,
    first_name: (record.first_name as string) || null,
    last_name: (record.last_name as string) || null,
    unsubscribed: (record.unsubscribed as string[]) || null,
  });

  console.log(
    `[gr-sync] ${record.email}: ${result.outcome}${result.detail ? ` (${result.detail})` : ""}`
  );

  return json({ email: record.email, ...result });
}

async function handleBulk(
  batchSize: number,
  offset: number,
  recurse: boolean
): Promise<Response> {
  const { data: customers, error: fetchErr } = await supabase
    .from("customers")
    .select("id, email, first_name, last_name, unsubscribed")
    .not("email", "is", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + batchSize - 1);

  if (fetchErr) {
    console.error(`[gr-sync] bulk fetch error at offset=${offset}:`, fetchErr);
    return json({ error: fetchErr.message, offset }, 500);
  }

  if (!customers || customers.length === 0) {
    console.log(`[gr-sync] bulk DONE at offset=${offset}`);
    return json({ done: true, processed: 0, offset });
  }

  const counts = { synced: 0, duplicate: 0, skipped: 0, error: 0 };
  const errors: string[] = [];

  for (const [i, c] of customers.entries()) {
    const result = await pushContact(c);
    counts[result.outcome]++;
    if (result.outcome === "error") errors.push(`${c.email}: ${result.detail}`);
    // GR rate limit: 4 req/sec → 300ms gives a safe ~3.3 req/sec.
    if (i < customers.length - 1) await delay(300);
  }

  const hasMore = customers.length === batchSize;
  const nextOffset = offset + customers.length;

  console.log(
    `[gr-sync] bulk offset=${offset} synced=${counts.synced} dup=${counts.duplicate} skipped=${counts.skipped} errors=${counts.error} hasMore=${hasMore}`
  );

  // Self-recurse for the next batch. Use EdgeRuntime.waitUntil so the
  // outgoing fetch outlives this response.
  if (hasMore && recurse) {
    const recursePromise = fetch(SELF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "bulk",
        batch_size: batchSize,
        offset: nextOffset,
      }),
    }).catch((e) => {
      console.error(
        `[gr-sync] SELF-RECURSE FAILED at next_offset=${nextOffset}:`,
        e
      );
    });
    // @ts-ignore EdgeRuntime is provided by Supabase Deno Deploy
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(recursePromise);
    }
  }

  return json({
    done: !hasMore,
    processed: customers.length,
    ...counts,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    next_offset: hasMore ? nextOffset : null,
    recursing: hasMore && recurse,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!GETRESPONSE_API_KEY) {
    return json({ error: "KITHCLIMATE_GETRESPONSE_API_KEY not set" }, 500);
  }

  try {
    const body = await req.json();
    if (body.mode === "bulk") {
      const batchSize = body.batch_size || 200;
      const offset = body.offset || 0;
      const recurse = body.no_recurse !== true;
      return await handleBulk(batchSize, offset, recurse);
    }
    return await handleSingle(body);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("kith-climate-getresponse-sync error:", msg);
    return json({ error: msg }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
