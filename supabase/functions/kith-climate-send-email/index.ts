import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Use kith_climate-specific API key, fall back to shared key
const RESEND_API_KEY = Deno.env.get("KITHCLIMATE_RESEND_API_KEY") || Deno.env.get("RESEND_API_KEY")!;

// Use kith_climate schema
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "kith_climate" },
});
const resend = new Resend(RESEND_API_KEY);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SendRequest {
  to: string | string[];           // recipient email(s)
  subject: string;
  html_body: string;               // complete HTML — sent as-is
  template_id?: string;            // if set, look up template and personalise
  customer_id?: string;            // link to kith_climate.customers
  email_type?: string;             // e.g. invite_to_interview, enrollment_confirmation
  cohort?: string;
  from?: string;                   // override sender (default from template or ben@kithailab.com)
  reply_to?: string;               // override reply-to (default from template)
  cc?: string[];                   // override CC (default from template)
  mode?: "immediate" | "template"; // default: immediate
}

// Personalise template content with customer data
function personaliseContent(
  content: string,
  customer: Record<string, any>,
  cohort?: string,
): string {
  if (!customer) return content;

  let out = content;
  out = out.replace(/{first_name}/g, customer.first_name || customer.email?.split("@")[0] || "there");
  out = out.replace(/{last_name}/g, customer.last_name || "");
  out = out.replace(/{email}/g, customer.email || "");
  out = out.replace(/{company}/g, customer.linkedin_company || customer.company_domain || "");
  out = out.replace(/{cohort}/g, cohort || "");
  out = out.replace(/{enrollment_deadline}/g, customer.enrollment_deadline || "");

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  out = out.replace(/{current_date}/g, currentDate);
  out = out.replace(/{current_year}/g, new Date().getFullYear().toString());

  return out;
}

// Personalise template content with payment data
function personalisePaymentContent(
  content: string,
  payment: Record<string, any>,
): string {
  if (!payment) return content;

  let out = content;

  // Format amount from cents to dollars with currency symbol
  const amountCents = payment.amount_cents ?? payment.amount ?? 0;
  const currency = (payment.currency || "USD").toUpperCase();
  const symbol = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "";
  const amountFormatted = `${symbol}${(amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  out = out.replace(/{payment_amount}/g, amountFormatted);
  out = out.replace(/{amount}/g, amountFormatted);
  out = out.replace(/{payment_currency}/g, currency);
  out = out.replace(/{payment_status}/g, payment.status || "");
  out = out.replace(/{payment_product}/g, payment.product || payment.description || "");
  out = out.replace(/{payment_cohort}/g, payment.cohort || "");

  // Format payment date
  if (payment.paid_at || payment.created_at) {
    const paidDate = new Date(payment.paid_at || payment.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    out = out.replace(/{payment_date}/g, paidDate);
  } else {
    out = out.replace(/{payment_date}/g, "");
  }

  out = out.replace(/{stripe_payment_intent_id}/g, payment.stripe_payment_intent_id || payment.payment_intent_id || "N/A");
  out = out.replace(/{stripe_customer_id}/g, payment.stripe_customer_id || "N/A");

  return out;
}

// Core send — calls Resend and records in kith_climate.emails
async function sendOne(opts: {
  to: string;
  subject: string;
  html: string;
  from: string;
  replyTo?: string;
  cc?: string[];
  customerId: string | null;
  emailType: string | null;
  cohort: string | null;
  templateId: string | null;
}): Promise<{ ok: boolean; resendId?: string; error?: string }> {
  const { to, subject, html, from, replyTo, cc, customerId, emailType, cohort, templateId } = opts;

  try {
    // Check unsubscribe status if we have a customer
    if (customerId) {
      const { data: cust } = await supabase
        .from("customers")
        .select("unsubscribed")
        .eq("id", customerId)
        .single();

      const unsubs: string[] = cust?.unsubscribed ?? [];
      // Block if unsubscribed from 'all' or matching email_type category
      if (unsubs.includes("all") || (emailType && unsubs.includes(emailType))) {
        console.log(`Skipping ${to} — unsubscribed from ${emailType || "all"}`);
        return { ok: false, error: "unsubscribed" };
      }
    }

    // Build Resend payload
    const emailPayload: Record<string, unknown> = {
      from,
      to: [to],
      subject,
      html,
    };
    if (replyTo) emailPayload.reply_to = replyTo;
    if (cc && cc.length) emailPayload.cc = cc;

    const res = await resend.emails.send(emailPayload as any);

    // Check for Resend API errors (suppressions, validation errors, etc.)
    // The Resend SDK v2 returns { data, error } — it does NOT throw on failures.
    if ((res as any)?.error) {
      const errorObj = (res as any).error;
      const errorMsg = errorObj.message || JSON.stringify(errorObj);
      console.error("Resend API error for", to, ":", errorMsg);

      // Log as suppressed/failed in kith_climate.emails
      const isSuppression = errorMsg.toLowerCase().includes("suppress");
      await supabase.from("emails").insert({
        customer_id: customerId,
        direction: "outbound",
        from_address: from,
        to_addresses: [to],
        subject,
        email_type: emailType,
        sent_at: new Date().toISOString(),
        cohort,
        status: isSuppression ? "suppressed" : "failed",
        error_message: errorMsg,
        template_id: templateId,
        sent_via: "resend",
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.error("Failed to log Resend error:", error);
      });

      return { ok: false, error: errorMsg };
    }

    const resendId = (res as any)?.data?.id ?? null;

    console.log("Resend response for", to, ":", resendId);

    // Persist in kith_climate.emails
    const row: Record<string, unknown> = {
      customer_id: customerId,
      direction: "outbound",
      from_address: from,
      to_addresses: [to],
      subject,
      email_type: emailType,
      sent_at: new Date().toISOString(),
      cohort,
      resend_email_id: resendId,
      status: "sent",
      template_id: templateId,
      sent_via: "resend",
      updated_at: new Date().toISOString(),
    };
    if (cc && cc.length) row.cc_addresses = cc;

    const { error: insertErr } = await supabase.from("emails").insert(row);
    if (insertErr) {
      console.error("Failed to insert email record:", insertErr);
    }

    return { ok: true, resendId: resendId ?? undefined };
  } catch (err: any) {
    console.error("sendOne error for", to, ":", err);

    // Log failure
    await supabase.from("emails").insert({
      customer_id: customerId,
      direction: "outbound",
      from_address: from,
      to_addresses: [to],
      subject,
      email_type: emailType,
      sent_at: new Date().toISOString(),
      cohort,
      status: "failed",
      error_message: err.message || String(err),
      template_id: templateId,
      sent_via: "resend",
      updated_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error("Failed to log failed email:", error);
    });

    return { ok: false, error: err.message || String(err) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: SendRequest = await req.json();
    const {
      to,
      subject: rawSubject,
      html_body: rawHtml,
      template_id,
      customer_id,
      email_type,
      cohort,
      from: requestFrom,
      reply_to: requestReplyTo,
      cc: requestCc,
      mode = "immediate",
    } = body;

    const recipients = Array.isArray(to) ? to : [to];

    // ---- Template mode: look up template, personalise per recipient ----
    if (mode === "template" && template_id) {
      const { data: tmpl, error: tmplErr } = await supabase
        .from("email_templates")
        .select("*")
        .eq("id", template_id)
        .single();

      if (tmplErr || !tmpl) {
        return json({ error: "Template not found" }, 404);
      }

      // Resolve from/reply_to/cc: request overrides > template defaults > global defaults
      const effectiveFrom = requestFrom || tmpl.from_address || "ben@kithailab.com";
      const effectiveReplyTo = requestReplyTo || tmpl.reply_to || undefined;
      const effectiveCc = (requestCc && requestCc.length > 0) ? requestCc : (tmpl.cc_addresses || undefined);

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const [i, recipientEmail] of recipients.entries()) {
        // Resolve customer for personalisation
        let customer: Record<string, any> | null = null;
        let custId = customer_id ?? null;

        if (!custId) {
          const { data: c } = await supabase
            .from("customers")
            .select("*")
            .eq("email", recipientEmail.toLowerCase())
            .single();
          if (c) {
            customer = c;
            custId = c.id;
          }
        } else {
          const { data: c } = await supabase
            .from("customers")
            .select("*")
            .eq("id", custId)
            .single();
          customer = c;
        }

        let personalised = customer
          ? { subject: personaliseContent(tmpl.subject, customer, cohort), html: personaliseContent(tmpl.content, customer, cohort) }
          : { subject: tmpl.subject, html: tmpl.content };

        // If payment placeholders remain, fetch latest payment and personalise
        if (custId && (personalised.subject.includes("{payment_") || personalised.html.includes("{payment_") || personalised.subject.includes("{amount}") || personalised.html.includes("{amount}") || personalised.html.includes("{stripe_"))) {
          const { data: latestPayment } = await supabase
            .from("payments")
            .select("*")
            .or(`customer_id.eq.${custId},enrollee_customer_id.eq.${custId}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestPayment) {
            personalised = {
              subject: personalisePaymentContent(personalised.subject, latestPayment),
              html: personalisePaymentContent(personalised.html, latestPayment),
            };
          }
        }

        const res = await sendOne({
          to: recipientEmail,
          subject: personalised.subject,
          html: personalised.html,
          from: effectiveFrom,
          replyTo: effectiveReplyTo,
          cc: effectiveCc,
          customerId: custId,
          emailType: email_type ?? tmpl.template_type,
          cohort: cohort ?? null,
          templateId: template_id,
        });

        if (res.ok) sent++;
        else {
          failed++;
          errors.push(`${recipientEmail}: ${res.error}`);
        }

        // Rate limit between sends
        if (i < recipients.length - 1) await delay(700);
      }

      return json({ ok: true, sent, failed, errors });
    }

    // ---- Immediate mode: send html_body as-is ----
    if (!rawSubject || !rawHtml) {
      return json({ error: "subject and html_body are required" }, 400);
    }

    const effectiveFrom = requestFrom || "ben@kithailab.com";

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const [i, recipientEmail] of recipients.entries()) {
      // Resolve customer_id if not provided
      let custId = customer_id ?? null;
      if (!custId) {
        const { data: c } = await supabase
          .from("customers")
          .select("id")
          .eq("email", recipientEmail.toLowerCase())
          .single();
        if (c) custId = c.id;
      }

      const res = await sendOne({
        to: recipientEmail,
        subject: rawSubject,
        html: rawHtml,
        from: effectiveFrom,
        replyTo: requestReplyTo,
        cc: requestCc,
        customerId: custId,
        emailType: email_type ?? null,
        cohort: cohort ?? null,
        templateId: template_id ?? null,
      });

      if (res.ok) sent++;
      else {
        failed++;
        errors.push(`${recipientEmail}: ${res.error}`);
      }

      if (i < recipients.length - 1) await delay(700);
    }

    return json({ ok: true, sent, failed, errors });
  } catch (e: any) {
    console.error("kith-climate-send-email error:", e);
    return json({ error: e.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
