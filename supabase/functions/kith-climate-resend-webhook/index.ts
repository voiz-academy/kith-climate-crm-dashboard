import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Webhook } from "https://esm.sh/svix@1.24.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "kith_climate" },
});

const log = (step: string, details?: Record<string, unknown>) => {
  const d = details ? ` — ${JSON.stringify(details)}` : "";
  console.log(`[resend-webhook] ${step}${d}`);
};

async function logToSystemLogs(
  status: "success" | "error",
  statusCode: number,
  durationMs: number,
  metadata: Record<string, unknown> = {},
  errorMessage?: string
) {
  try {
    await supabase.from("system_logs").insert({
      function_name: "kith-climate-resend-webhook",
      status,
      status_code: statusCode,
      duration_ms: durationMs,
      metadata,
      error_message: errorMessage,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to write system log:", e);
  }
}

// Verify the Resend webhook signature using svix
function verifySignature(payload: string, headers: Record<string, string>): unknown {
  const wh = new Webhook(RESEND_WEBHOOK_SECRET);
  return wh.verify(payload, {
    "svix-id": headers["svix-id"],
    "svix-timestamp": headers["svix-timestamp"],
    "svix-signature": headers["svix-signature"],
  });
}

serve(async (req) => {
  const startMs = Date.now();

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Extract svix headers
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";

  // Verify signature
  let event: { type: string; created_at: string; data: Record<string, unknown> };
  try {
    event = verifySignature(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Signature verification failed", { error: msg });
    await logToSystemLogs("error", 401, Date.now() - startMs, { svixId }, msg);
    return new Response("Invalid signature", { status: 401 });
  }

  const { type, data } = event;
  const emailId = data.email_id as string | undefined;

  if (!emailId) {
    log("No email_id in event", { type });
    await logToSystemLogs("error", 400, Date.now() - startMs, { type }, "Missing email_id");
    return new Response("Missing email_id", { status: 400 });
  }

  log("Processing event", { type, emailId });
  const now = new Date().toISOString();

  try {
    switch (type) {
      case "email.delivered": {
        await supabase
          .from("emails")
          .update({ status: "delivered", delivered_at: now, updated_at: now })
          .eq("resend_email_id", emailId);
        break;
      }

      case "email.opened": {
        // Increment open_count, set first_opened_at only if null
        const { data: existing } = await supabase
          .from("emails")
          .select("first_opened_at, open_count")
          .eq("resend_email_id", emailId)
          .single();

        const updates: Record<string, unknown> = {
          opened_at: now,
          last_opened_at: now,
          open_count: (existing?.open_count ?? 0) + 1,
          updated_at: now,
        };
        if (!existing?.first_opened_at) {
          updates.first_opened_at = now;
        }

        await supabase
          .from("emails")
          .update(updates)
          .eq("resend_email_id", emailId);
        break;
      }

      case "email.clicked": {
        const clickData = data.click as { link?: string; ipAddress?: string; userAgent?: string } | undefined;

        // Increment click_count, set first_clicked_at only if null
        const { data: existing } = await supabase
          .from("emails")
          .select("first_clicked_at, click_count")
          .eq("resend_email_id", emailId)
          .single();

        const updates: Record<string, unknown> = {
          clicked_at: now,
          last_clicked_at: now,
          click_count: (existing?.click_count ?? 0) + 1,
          updated_at: now,
        };
        if (!existing?.first_clicked_at) {
          updates.first_clicked_at = now;
        }

        await supabase
          .from("emails")
          .update(updates)
          .eq("resend_email_id", emailId);

        // Log click details to system_logs for analytics
        if (clickData?.link) {
          log("Click tracked", { emailId, link: clickData.link });
        }
        break;
      }

      case "email.bounced": {
        const bounce = data.bounce as { message?: string; type?: string; subType?: string } | undefined;
        const errorMsg = bounce
          ? `${bounce.type ?? "Unknown"}: ${bounce.subType ?? ""} — ${bounce.message ?? ""}`
          : "Bounce (no details)";

        await supabase
          .from("emails")
          .update({ status: "bounced", bounced_at: now, error_message: errorMsg, updated_at: now })
          .eq("resend_email_id", emailId);

        // If we have a customer, mark suppression to prevent future sends
        const { data: emailRow } = await supabase
          .from("emails")
          .select("customer_id, to_addresses")
          .eq("resend_email_id", emailId)
          .single();

        if (emailRow?.customer_id && bounce?.type === "Permanent") {
          log("Permanent bounce — flagging customer", { customerId: emailRow.customer_id });
        }
        break;
      }

      case "email.complained": {
        await supabase
          .from("emails")
          .update({ status: "complained", error_message: "Spam complaint", updated_at: now })
          .eq("resend_email_id", emailId);

        // Auto-unsubscribe the customer on spam complaint
        const { data: emailRow } = await supabase
          .from("emails")
          .select("customer_id")
          .eq("resend_email_id", emailId)
          .single();

        if (emailRow?.customer_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("unsubscribed")
            .eq("id", emailRow.customer_id)
            .single();

          const unsubs: string[] = cust?.unsubscribed ?? [];
          if (!unsubs.includes("all")) {
            await supabase
              .from("customers")
              .update({ unsubscribed: [...unsubs, "all"] })
              .eq("id", emailRow.customer_id);
            log("Auto-unsubscribed on complaint", { customerId: emailRow.customer_id });
          }
        }
        break;
      }

      default:
        log("Unhandled event type", { type });
    }

    await logToSystemLogs("success", 200, Date.now() - startMs, { type, emailId });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Error processing event", { type, emailId, error: msg });
    await logToSystemLogs("error", 500, Date.now() - startMs, { type, emailId }, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
