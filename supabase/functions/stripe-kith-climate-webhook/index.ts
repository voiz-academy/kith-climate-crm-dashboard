import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
const supabaseKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecret = Deno.env.get("STRIPE_KITH_SECRET_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_KITHCLIMATE_WEBHOOK_SECRET")!;

// Default cohort for all payments. Updated when a new cohort begins.
const CURRENT_COHORT = "May 18th 2026";

// Full enrolment amount in cents ($1,500 USD).
// Payments at or above this in a single checkout are treated as full
// enrolment payments: matched to a customer, assigned a cohort, and
// trigger the enrolment funnel advancement.
// Payments below this are treated as partial/installment payments:
// they are still recorded but are NOT matched to a customer and do NOT
// trigger enrolment. They receive no cohort assignment.
const FULL_ENROLMENT_CENTS = 150000;

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "kith_climate" },
});

const log = (step: string, details?: Record<string, unknown>) => {
  const d = details ? ` \u2014 ${JSON.stringify(details)}` : "";
  console.log(`[stripe-kith-climate] ${step}${d}`);
};

// ——— SYSTEM LOGS ————————————————————————————————————————————————
async function logToSystemLogs(
  status: "success" | "error",
  statusCode: number,
  durationMs: number,
  metadata: Record<string, unknown> = {},
  errorMessage?: string
) {
  try {
    await supabase.from("system_logs").insert({
      function_name: "stripe-kith-climate-webhook",
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

// ——— FUNNEL ADVANCEMENT ————————————————————————————————————————
// Uses the advance_funnel RPC which updates BOTH funnel_status and
// cohort_statuses JSONB atomically — prevents cohort status drift.
async function advanceFunnel(customerId: string, targetStatus: string, cohort?: string) {
  const { error } = await supabase.rpc("advance_funnel", {
    p_customer_id: customerId,
    p_new_status: targetStatus,
    p_cohort: cohort || null,
  });

  if (error) {
    log("Funnel advancement failed", { customerId, targetStatus, cohort, error: error.message });
  } else {
    log("Funnel advanced", { customerId, to: targetStatus, cohort });
  }
}

// ——— ORPHAN PAYMENT ALERT ——————————————————————————————————————
// Sends an admin email when a Stripe payment arrives without a matching
// CRM customer. Non-fatal: if the alert fails, the webhook still succeeds
// (the orphan row is already saved and visible in /reconcile).
const ORPHAN_ALERT_RECIPIENTS = ["ben@kithailab.com", "diego@kithailab.com"];
const RECONCILE_URL = "https://crm.kithclimate.com/reconcile";

async function sendOrphanAlert(args: {
  paymentId: string | undefined;
  stripeEmail: string;
  amountCents: number;
  currency: string;
  stripeEventId: string;
  paymentIntentId: string | null;
  source: "checkout" | "invoice";
}) {
  try {
    const amountStr = `${args.currency.toUpperCase()} ${(args.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const subject = `[Kith Climate] Unmatched payment from ${args.stripeEmail} — ${amountStr}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; padding: 20px;">
        <h2 style="color: #1a1d21; margin-top: 0;">Stripe payment with no CRM customer</h2>
        <p style="color: #4a4e54;">A Stripe charge succeeded but the billing email didn&rsquo;t match any customer in the CRM. Most often this is because the customer paid with a different email than they applied with.</p>
        <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 6px 12px 6px 0; color: #6b6e74;">Amount</td><td style="padding: 6px 0; font-weight: 600; color: #1a1d21;">${amountStr}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #6b6e74;">Stripe billing email</td><td style="padding: 6px 0; font-family: ui-monospace, monospace; color: #1a1d21;">${args.stripeEmail}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #6b6e74;">Source</td><td style="padding: 6px 0; color: #1a1d21;">${args.source}.session.completed</td></tr>
          ${args.paymentIntentId ? `<tr><td style="padding: 6px 12px 6px 0; color: #6b6e74;">Payment intent</td><td style="padding: 6px 0; font-family: ui-monospace, monospace; font-size: 12px; color: #1a1d21;">${args.paymentIntentId}</td></tr>` : ""}
          <tr><td style="padding: 6px 12px 6px 0; color: #6b6e74;">Stripe event</td><td style="padding: 6px 0; font-family: ui-monospace, monospace; font-size: 12px; color: #1a1d21;">${args.stripeEventId}</td></tr>
        </table>
        <p style="margin-top: 24px;">
          <a href="${RECONCILE_URL}" style="display: inline-block; background: #5B9A8B; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">Reconcile in dashboard →</a>
        </p>
        <p style="color: #6b6e74; font-size: 12px; margin-top: 32px;">The payment is safe — recorded in <code>kith_climate.payments</code> with <code>reconciliation_status = 'unmatched_email'</code>. Reconciling will link it to the right customer and trigger the welcome email automatically.</p>
      </div>
    `.trim();

    const resp = await fetch(`${supabaseUrl}/functions/v1/kith-climate-send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({
        to: ORPHAN_ALERT_RECIPIENTS,
        subject,
        html_body: html,
        email_type: "admin_orphan_payment_alert",
        mode: "immediate",
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      log("Orphan alert email failed (non-fatal)", { status: resp.status, body: txt.slice(0, 200) });
    } else {
      log("Orphan alert email sent", { paymentId: args.paymentId, recipients: ORPHAN_ALERT_RECIPIENTS });
    }
  } catch (err) {
    log("Orphan alert email error (non-fatal)", { error: String(err) });
  }
}

// ——— HMAC SIGNATURE VERIFICATION ———————————————————————————————
async function verifyStripeSignature(
  body: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const elements = sigHeader.split(",");
  const tsPart  = elements.find((e) => e.startsWith("t="));
  const sigPart = elements.find((e) => e.startsWith("v1="));
  if (!tsPart || !sigPart) return false;

  const timestamp = tsPart.split("=")[1];
  const expected  = sigPart.split("=")[1];

  // Reject events older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) {
    log("Signature timestamp too old", { ageSeconds: age });
    return false;
  }

  const payload = `${timestamp}.${body}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === expected;
}

// ——— STRIPE API HELPERS ————————————————————————————————————————
async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeSecret}` },
  });
  if (!res.ok) {
    log("Stripe API error", { path, status: res.status });
    return null;
  }
  return res.json();
}

// ——— CUSTOMER LOOKUP ———————————————————————————————————————————
async function findCustomerByEmail(email: string) {
  const { data } = await supabase
    .from("customers")
    .select("id, cohort_statuses")
    .eq("email", email.toLowerCase().trim())
    .single();
  return data;
}

/**
 * Determine the cohort for a payment.
 * Always uses CURRENT_COHORT. Previous logic tried to detect "future"
 * cohorts from cohort_statuses but couldn't distinguish past from future
 * (no date parsing), causing payments to be assigned to old cohorts.
 */
function determineCohort(
  _cohortStatuses: Record<string, { status: string; updated_at: string }> | null
): string {
  return CURRENT_COHORT;
}

// ——— MAIN HANDLER ——————————————————————————————————————————————
Deno.serve(async (req: Request) => {
  const start = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const json = (obj: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const body = await req.text();
    const sigHeader = req.headers.get("stripe-signature");

    if (!sigHeader) {
      await logToSystemLogs("error", 400, Date.now() - start, { reason: "missing_signature" }, "Missing stripe-signature header");
      return json({ error: "Missing stripe-signature" }, 400);
    }

    // Verify signature
    const valid = await verifyStripeSignature(body, sigHeader, webhookSecret);
    if (!valid) {
      log("Invalid webhook signature");
      await logToSystemLogs("error", 401, Date.now() - start, { reason: "invalid_signature" }, "Invalid webhook signature");
      return json({ error: "Invalid signature" }, 401);
    }
    log("Signature verified");

    const event = JSON.parse(body);
    log("Event received", { type: event.type, id: event.id });

    // —— CHECKOUT.SESSION.COMPLETED ———————————————————————————————
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const customerEmail = (session.customer_details?.email ||
                             session.customer_email ||
                             "").toLowerCase().trim();
      const stripeCustomerId = session.customer || null;
      const paymentIntentId  = session.payment_intent || null;
      const sessionId        = session.id;
      const amountTotal      = session.amount_total || 0;
      const currency         = session.currency || "usd";

      log("Checkout session", { customerEmail, sessionId, amountTotal });

      // Fetch line items from Stripe API to get product info
      let productIds: string[] = [];
      let productName: string | null = null;

      const lineItems = await stripeGet(
        `/checkout/sessions/${sessionId}/line_items?expand[]=data.price.product`
      );

      if (lineItems?.data) {
        for (const item of lineItems.data) {
          const pid = item.price?.product?.id || item.price?.product;
          if (pid) productIds.push(pid);
          if (!productName && item.description) productName = item.description;
          if (!productName && item.price?.product?.name) productName = item.price.product.name;
        }
      }

      log("Line item products", { productIds, productName });

      // —— PARTIAL / INSTALLMENT PAYMENT CHECK ————————————————————
      // Payments below the full enrolment amount ($1,500) are installments
      // or partial payments. We still record them for bookkeeping but do
      // NOT match them to a customer, assign a cohort, or trigger enrolment.
      if (amountTotal < FULL_ENROLMENT_CENTS) {
        log("Partial/installment payment — recording without customer match", {
          amountTotal,
          threshold: FULL_ENROLMENT_CENTS,
        });

        // Dedup by checkout session ID
        const { data: existing } = await supabase
          .from("payments")
          .select("id")
          .eq("stripe_checkout_session_id", sessionId)
          .maybeSingle();

        if (existing) {
          log("Duplicate checkout session (partial)", { sessionId });
          await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_duplicate_partial", stripe_event_id: event.id });
          return json({ status: "skipped", reason: "duplicate" });
        }

        const primaryProductId = productIds.length > 0 ? productIds[0] : null;

        const { error: insertErr } = await supabase.from("payments").insert({
          stripe_payment_intent_id: paymentIntentId,
          stripe_checkout_session_id: sessionId,
          stripe_customer_id: stripeCustomerId,
          amount_cents: amountTotal,
          currency: currency,
          status: "succeeded",
          product: productName || "Installment",
          paid_at: new Date(session.created * 1000).toISOString(),
          metadata: {
            product_id: primaryProductId,
            all_product_ids: productIds,
            stripe_event_id: event.id,
            payment_status: session.payment_status,
            mode: session.mode,
            partial_payment: true,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (insertErr) {
          log("Insert error (partial)", { error: insertErr.message });
          await logToSystemLogs("error", 500, Date.now() - start, { event_type: event.type, stripe_event_id: event.id }, insertErr.message);
          return json({ status: "error", error: insertErr.message }, 500);
        }

        log("Partial payment recorded", { amount: amountTotal, email: customerEmail });
        await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "recorded_partial", amount_cents: amountTotal, email: customerEmail, stripe_event_id: event.id });
        return json({
          status: "recorded_partial",
          amount: amountTotal,
          reason: "below_full_enrolment_amount",
        });
      }

      // —— FULL PAYMENT FLOW (>= $1,500) —————————————————————————

      // Find customer in kith_climate.customers
      if (!customerEmail) {
        log("No customer email in checkout session");
        await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_no_email", stripe_event_id: event.id });
        return json({ status: "skipped", reason: "no_email" });
      }

      const customer = await findCustomerByEmail(customerEmail);
      if (!customer) {
        // —— ORPHAN PAYMENT ————————————————————————————————————————
        // Record the payment with no customer link so it surfaces in the
        // /reconcile dashboard view instead of being silently dropped.
        // Common cause: Stripe billing email differs from the CRM contact email.
        log("Customer not found — recording as orphan for reconciliation", { email: customerEmail });

        // Dedup by checkout session ID
        const { data: existingOrphan } = await supabase
          .from("payments")
          .select("id")
          .eq("stripe_checkout_session_id", sessionId)
          .maybeSingle();

        if (existingOrphan) {
          log("Duplicate checkout session (orphan)", { sessionId });
          await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_duplicate_orphan", stripe_event_id: event.id });
          return json({ status: "skipped", reason: "duplicate" });
        }

        const primaryProductId = productIds.length > 0 ? productIds[0] : null;

        const { data: orphan, error: orphanErr } = await supabase
          .from("payments")
          .insert({
            customer_id: null,
            enrollee_customer_id: null,
            stripe_payment_intent_id: paymentIntentId,
            stripe_checkout_session_id: sessionId,
            stripe_customer_id: stripeCustomerId,
            amount_cents: amountTotal,
            currency: currency,
            status: "succeeded",
            product: productName || "Kith Climate",
            cohort: null, // Determined at reconciliation time from the linked customer
            paid_at: new Date(session.created * 1000).toISOString(),
            reconciliation_status: "unmatched_email",
            metadata: {
              product_id: primaryProductId,
              all_product_ids: productIds,
              stripe_event_id: event.id,
              stripe_email: customerEmail,
              payment_status: session.payment_status,
              mode: session.mode,
              needs_reconciliation: true,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (orphanErr) {
          log("Orphan insert error", { error: orphanErr.message });
          await logToSystemLogs("error", 500, Date.now() - start, { event_type: event.type, email: customerEmail, stripe_event_id: event.id }, orphanErr.message);
          return json({ status: "error", error: orphanErr.message }, 500);
        }

        log("Orphan payment recorded", { paymentId: orphan?.id, email: customerEmail, amount: amountTotal });
        await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "recorded_unmatched", email: customerEmail, amount_cents: amountTotal, payment_id: orphan?.id, stripe_event_id: event.id });

        // Fire the admin alert email (non-blocking; failure does not fail the webhook)
        await sendOrphanAlert({
          paymentId: orphan?.id,
          stripeEmail: customerEmail,
          amountCents: amountTotal,
          currency,
          stripeEventId: event.id,
          paymentIntentId,
          source: "checkout",
        });

        return json({
          status: "recorded_unmatched",
          payment_id: orphan?.id,
          email: customerEmail,
          reason: "needs_reconciliation",
        });
      }

      // Dedup by checkout session ID
      const { data: existing } = await supabase
        .from("payments")
        .select("id")
        .eq("stripe_checkout_session_id", sessionId)
        .maybeSingle();

      if (existing) {
        log("Duplicate checkout session", { sessionId });
        await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_duplicate", stripe_event_id: event.id });
        return json({ status: "skipped", reason: "duplicate" });
      }

      const cohort = determineCohort(customer.cohort_statuses);
      log("Determined cohort", { cohort, cohort_statuses: customer.cohort_statuses });

      const primaryProductId = productIds.length > 0 ? productIds[0] : null;

      const { error: insertErr } = await supabase.from("payments").insert({
        customer_id: customer.id,
        enrollee_customer_id: customer.id,
        stripe_payment_intent_id: paymentIntentId,
        stripe_checkout_session_id: sessionId,
        stripe_customer_id: stripeCustomerId,
        amount_cents: amountTotal,
        currency: currency,
        status: "succeeded",
        product: productName || "Kith Climate",
        cohort: cohort,
        paid_at: new Date(session.created * 1000).toISOString(),
        metadata: {
          product_id: primaryProductId,
          all_product_ids: productIds,
          stripe_event_id: event.id,
          payment_status: session.payment_status,
          mode: session.mode,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (insertErr) {
        log("Insert error", { error: insertErr.message });
        await logToSystemLogs("error", 500, Date.now() - start, { event_type: event.type, email: customerEmail, stripe_event_id: event.id }, insertErr.message);
        return json({ status: "error", error: insertErr.message }, 500);
      }

      // Advance funnel to enrolled (cohort-aware — updates both funnel_status and cohort_statuses)
      await advanceFunnel(customer.id, "enrolled", cohort);

      log("Payment created & customer enrolled", { email: customerEmail, amount: amountTotal, productIds, cohort });
      await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "created_enrolment", email: customerEmail, amount_cents: amountTotal, cohort, stripe_event_id: event.id });
      return json({ status: "created", email: customerEmail, product_ids: productIds, cohort });
    }

    // —— INVOICE.PAYMENT_SUCCEEDED ————————————————————————————————
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const customerEmail = (invoice.customer_email || "").toLowerCase().trim();
      const stripeCustomerId = invoice.customer || null;
      const paymentIntentId  = invoice.payment_intent || null;
      const invoiceId        = invoice.id;
      const amountPaid       = invoice.amount_paid || 0;
      const currency         = invoice.currency || "usd";

      log("Invoice payment succeeded", { customerEmail, invoiceId, amountPaid });

      // Skip $0 invoices (e.g. trial starts, free tier)
      if (amountPaid === 0) {
        log("Skipping $0 invoice", { invoiceId });
        await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_zero_amount", stripe_event_id: event.id });
        return json({ status: "skipped", reason: "zero_amount" });
      }

      // Dedup by payment_intent (invoices tie to a payment_intent)
      if (paymentIntentId) {
        const { data: existingByPi } = await supabase
          .from("payments")
          .select("id")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle();

        if (existingByPi) {
          log("Duplicate invoice payment (matched by payment_intent)", { paymentIntentId });
          await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_duplicate_invoice", stripe_event_id: event.id });
          return json({ status: "skipped", reason: "duplicate" });
        }
      }

      // Get product info from invoice line items
      let productName: string | null = null;
      let productIds: string[] = [];
      if (invoice.lines?.data) {
        for (const line of invoice.lines.data) {
          if (line.description && !productName) productName = line.description;
          const pid = line.price?.product;
          if (pid && typeof pid === "string") productIds.push(pid);
        }
      }

      // Determine if this is a full enrolment or installment
      if (amountPaid >= FULL_ENROLMENT_CENTS && customerEmail) {
        // Full payment via invoice — match to customer and enrol
        const customer = await findCustomerByEmail(customerEmail);
        if (customer) {
          const cohort = determineCohort(customer.cohort_statuses);
          const primaryProductId = productIds.length > 0 ? productIds[0] : null;

          const { error: insertErr } = await supabase.from("payments").insert({
            customer_id: customer.id,
            enrollee_customer_id: customer.id,
            stripe_payment_intent_id: paymentIntentId,
            stripe_customer_id: stripeCustomerId,
            amount_cents: amountPaid,
            currency: currency,
            status: "succeeded",
            product: productName || "Kith Climate",
            cohort: cohort,
            paid_at: new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000).toISOString(),
            metadata: {
              product_id: primaryProductId,
              all_product_ids: productIds,
              stripe_event_id: event.id,
              invoice_id: invoiceId,
              billing_reason: invoice.billing_reason,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          if (insertErr) {
            log("Insert error (invoice enrolment)", { error: insertErr.message });
            await logToSystemLogs("error", 500, Date.now() - start, { event_type: event.type, email: customerEmail, stripe_event_id: event.id }, insertErr.message);
            return json({ status: "error", error: insertErr.message }, 500);
          }

          // Advance funnel to enrolled (cohort-aware — updates both funnel_status and cohort_statuses)
          await advanceFunnel(customer.id, "enrolled", cohort);

          log("Invoice enrolment payment created & customer enrolled", { email: customerEmail, amount: amountPaid, cohort });
          await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "created_invoice_enrolment", email: customerEmail, amount_cents: amountPaid, cohort, stripe_event_id: event.id });
          return json({ status: "created", email: customerEmail, cohort });
        } else {
          // —— ORPHAN INVOICE PAYMENT ——————————————————————————————
          // Full enrolment amount, but Stripe customer email didn't match a
          // CRM customer. Record as orphan rather than letting it fall through
          // to the partial-payment branch (which would mislabel it).
          log("Customer not found for invoice enrolment — recording as orphan", { email: customerEmail });

          const primaryProductId = productIds.length > 0 ? productIds[0] : null;

          const { data: orphan, error: orphanErr } = await supabase
            .from("payments")
            .insert({
              customer_id: null,
              enrollee_customer_id: null,
              stripe_payment_intent_id: paymentIntentId,
              stripe_customer_id: stripeCustomerId,
              amount_cents: amountPaid,
              currency: currency,
              status: "succeeded",
              product: productName || "Kith Climate",
              cohort: null,
              paid_at: new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000).toISOString(),
              reconciliation_status: "unmatched_email",
              metadata: {
                product_id: primaryProductId,
                all_product_ids: productIds,
                stripe_event_id: event.id,
                invoice_id: invoiceId,
                billing_reason: invoice.billing_reason,
                stripe_email: customerEmail,
                needs_reconciliation: true,
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (orphanErr) {
            log("Orphan insert error (invoice)", { error: orphanErr.message });
            await logToSystemLogs("error", 500, Date.now() - start, { event_type: event.type, email: customerEmail, stripe_event_id: event.id }, orphanErr.message);
            return json({ status: "error", error: orphanErr.message }, 500);
          }

          log("Orphan invoice payment recorded", { paymentId: orphan?.id, email: customerEmail, amount: amountPaid });
          await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "recorded_unmatched_invoice", email: customerEmail, amount_cents: amountPaid, payment_id: orphan?.id, stripe_event_id: event.id });

          // Fire the admin alert email
          await sendOrphanAlert({
            paymentId: orphan?.id,
            stripeEmail: customerEmail,
            amountCents: amountPaid,
            currency,
            stripeEventId: event.id,
            paymentIntentId,
            source: "invoice",
          });

          return json({
            status: "recorded_unmatched",
            payment_id: orphan?.id,
            email: customerEmail,
            reason: "needs_reconciliation",
          });
        }
      }

      // Partial / installment invoice payment or customer not found — record without matching
      const primaryProductId = productIds.length > 0 ? productIds[0] : null;

      const { error: insertErr } = await supabase.from("payments").insert({
        stripe_payment_intent_id: paymentIntentId,
        stripe_customer_id: stripeCustomerId,
        amount_cents: amountPaid,
        currency: currency,
        status: "succeeded",
        product: productName || "Installment",
        paid_at: new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000).toISOString(),
        metadata: {
          product_id: primaryProductId,
          all_product_ids: productIds,
          stripe_event_id: event.id,
          invoice_id: invoiceId,
          billing_reason: invoice.billing_reason,
          partial_payment: true,
          customer_email: customerEmail || null,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (insertErr) {
        log("Insert error (invoice partial)", { error: insertErr.message });
        await logToSystemLogs("error", 500, Date.now() - start, { event_type: event.type, stripe_event_id: event.id }, insertErr.message);
        return json({ status: "error", error: insertErr.message }, 500);
      }

      log("Invoice installment recorded", { amount: amountPaid, email: customerEmail });
      await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "recorded_invoice_installment", amount_cents: amountPaid, email: customerEmail || null, stripe_event_id: event.id });
      return json({ status: "recorded_invoice_installment", amount: amountPaid });
    }

    // —— CHARGE.REFUNDED —————————————————————————————————————————
    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent;

      if (!paymentIntentId) {
        await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_no_payment_intent", stripe_event_id: event.id });
        return json({ status: "skipped", reason: "no_payment_intent" });
      }

      const { data: payment } = await supabase
        .from("payments")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (!payment) {
        log("No matching payment for refund", { paymentIntentId });
        await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_payment_not_found", stripe_event_id: event.id });
        return json({ status: "skipped", reason: "payment_not_found" });
      }

      const { error: refundErr } = await supabase
        .from("payments")
        .update({
          status: "refunded",
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (refundErr) {
        log("Refund update error", { error: refundErr.message });
        await logToSystemLogs("error", 500, Date.now() - start, { event_type: event.type, stripe_event_id: event.id }, refundErr.message);
        return json({ status: "error", error: refundErr.message }, 500);
      }

      log("Payment refunded", { paymentId: payment.id });
      await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "refunded", payment_id: payment.id, stripe_event_id: event.id });
      return json({ status: "refunded" });
    }

    // —— UNHANDLED EVENT TYPE ————————————————————————————————————
    log("Ignoring event type", { type: event.type });
    await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "ignored" });
    return json({ status: "ignored", event_type: event.type });

  } catch (err) {
    log("Unhandled error", { error: String(err) });
    await logToSystemLogs("error", 500, Date.now() - start, {}, String(err));
    return json({ status: "error", message: String(err) }, 500);
  }
});
