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

// Funnel rank system — only advance, never backslide
const FUNNEL_RANKS: Record<string, number> = {
  registered: 1,
  applied: 2,
  application_rejected: 2,
  invited_to_interview: 3,
  booked: 4,
  interviewed: 5,
  no_show: 5,
  interview_rejected: 5,
  invited_to_enrol: 6,
  offer_expired: 6,
  requested_discount: 6,
  deferred_next_cohort: 6,
  enrolled: 7,
};

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
async function advanceFunnel(customerId: string, targetStatus: string) {
  const targetRank = FUNNEL_RANKS[targetStatus];
  if (!targetRank) {
    log("Unknown target funnel status", { targetStatus });
    return;
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("funnel_status")
    .eq("id", customerId)
    .single();

  if (!customer) {
    log("Customer not found for funnel advancement", { customerId });
    return;
  }

  const currentRank = FUNNEL_RANKS[customer.funnel_status] || 0;
  if (currentRank >= targetRank) {
    log("Funnel already at or past target", {
      customerId,
      current: customer.funnel_status,
      target: targetStatus,
    });
    return;
  }

  const { error } = await supabase
    .from("customers")
    .update({ funnel_status: targetStatus, updated_at: new Date().toISOString() })
    .eq("id", customerId);

  if (error) {
    log("Funnel advancement failed", { customerId, error: error.message });
  } else {
    log("Funnel advanced", {
      customerId,
      from: customer.funnel_status,
      to: targetStatus,
    });
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
 * Default: CURRENT_COHORT.
 * If the customer already has a different (future) cohort in their
 * cohort_statuses JSONB, use that cohort instead — it means they're
 * paying for a future cohort.
 */
function determineCohort(
  cohortStatuses: Record<string, { status: string; updated_at: string }> | null
): string {
  if (!cohortStatuses) return CURRENT_COHORT;

  const cohorts = Object.keys(cohortStatuses);
  if (cohorts.length === 0) return CURRENT_COHORT;

  // If there's a cohort entry that isn't the current default,
  // the customer is paying for that future cohort.
  const futureCohort = cohorts.find((c) => c !== CURRENT_COHORT);
  if (futureCohort) {
    log("Customer has future cohort in cohort_statuses", { futureCohort });
    return futureCohort;
  }

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
        log("Customer not found in kith_climate", { email: customerEmail });
        await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "skipped_customer_not_found", email: customerEmail, stripe_event_id: event.id });
        return json({
          status: "skipped",
          reason: "customer_not_found",
          email: customerEmail,
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

      // Advance funnel to enrolled
      await advanceFunnel(customer.id, "enrolled");

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

          // Advance funnel to enrolled
          await advanceFunnel(customer.id, "enrolled");

          log("Invoice enrolment payment created & customer enrolled", { email: customerEmail, amount: amountPaid, cohort });
          await logToSystemLogs("success", 200, Date.now() - start, { event_type: event.type, action: "created_invoice_enrolment", email: customerEmail, amount_cents: amountPaid, cohort, stripe_event_id: event.id });
          return json({ status: "created", email: customerEmail, cohort });
        } else {
          log("Customer not found for invoice enrolment", { email: customerEmail });
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
