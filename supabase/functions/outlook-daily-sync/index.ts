import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const AZURE_TENANT_ID = Deno.env.get("AZURE_TENANT_ID") ?? "";
const AZURE_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID") ?? "";
const AZURE_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET") ?? "";

const missingSecrets: string[] = [];
if (!AZURE_TENANT_ID) missingSecrets.push("AZURE_TENANT_ID");
if (!AZURE_CLIENT_ID) missingSecrets.push("AZURE_CLIENT_ID");
if (!AZURE_CLIENT_SECRET) missingSecrets.push("AZURE_CLIENT_SECRET");
if (!supabaseUrl) missingSecrets.push("SUPABASE_URL");
if (!supabaseServiceKey) missingSecrets.push("SUPABASE_SERVICE_ROLE_KEY");

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: "kith_climate" },
    })
  : null;

const MAILBOXES = ["ben@kithailab.com", "diego@kithailab.com"];
const CURRENT_COHORT = "May 18th 2026";

// ── Types ──────────────────────────────────────────────────────────────

interface CohortStatusEntry {
  status: string;
  updated_at: string;
}

type CohortStatuses = Record<string, CohortStatusEntry>;

interface CustomerRef {
  id: string;
  email: string;
  funnel_status: string;
  cohort_statuses: CohortStatuses | null;
}

interface EmailMatch {
  recipientEmail: string;
  subject: string;
  sentAt: string;
  sender: string;
}

interface GraphMessage {
  id: string;
  subject: string;
  sentDateTime: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
}

interface SyncCategoryResult {
  total_emails: number;
  matched: number;
  pending_changes: number;
  already_at_or_past: number;
  duplicate_pending: number;
  no_customer_found: number;
  auto_rejected_emails: number;
  errors: string[];
  details: Array<{ email: string; action: string }>;
}

// ── Funnel rank system ─────────────────────────────────────────────────

const FUNNEL_RANK: Record<string, number> = {
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

// ── Subject patterns for email classification ──────────────────────────

const INTERVIEW_INVITE_SUBJECTS = [
  "interview invite: kith climate",
  "interview invite",
];

const ENROLLMENT_INVITE_SUBJECTS = [
  "kith climate: cohort invitation",
  "cohort acceptance",
  "cohort enrollment",
  "kith climate enrollment",
];

const INTERVIEW_REJECTION_SUBJECTS = [
  "interview feedback",
  "kith climate: interview feedback",
  "interview update",
  "kith climate: interview update",
];

const INTERVIEW_REMINDER_SUBJECTS = [
  "interview reminder",
  "kith climate: interview reminder",
  "reminder: interview",
];

// Smart detection patterns — broader signals that indicate the email type
// even if the subject doesn't exactly match the known templates
const SMART_INTERVIEW_PATTERNS = [
  /interview.*invite/i,
  /invite.*interview/i,
  /schedule.*interview/i,
  /interview.*schedule/i,
  /interview.*book/i,
  /calendly.*interview/i,
];

const SMART_ENROLLMENT_PATTERNS = [
  /cohort.*invit/i,
  /invit.*cohort/i,
  /enrollment.*invit/i,
  /invit.*enrol/i,
  /accept.*cohort/i,
  /cohort.*accept/i,
  /welcome.*cohort/i,
];

// ── MS Graph auth ──────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get access token: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── MS Graph email fetching ────────────────────────────────────────────

async function fetchSentEmails(
  accessToken: string,
  mailbox: string,
  daysBack: number
): Promise<GraphMessage[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString();

  const allMessages: GraphMessage[] = [];
  let nextLink: string | null =
    `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/SentItems/messages` +
    `?$filter=sentDateTime ge ${sinceStr}` +
    `&$select=id,subject,sentDateTime,from,toRecipients,ccRecipients` +
    `&$top=100` +
    `&$orderby=sentDateTime desc`;

  while (nextLink) {
    const res = await fetch(nextLink, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Graph API error for ${mailbox}: ${res.status} ${err}`);
      break;
    }

    const data = await res.json();
    allMessages.push(...(data.value ?? []));
    nextLink = data["@odata.nextLink"] ?? null;
  }

  return allMessages;
}

// ── Email classification ───────────────────────────────────────────────

function classifyEmail(msg: GraphMessage): {
  category:
    | "interview_invite"
    | "enrollment_invite"
    | "interview_rejection"
    | "interview_reminder"
    | null;
  isSmartDetected: boolean;
} {
  const subject = (msg.subject ?? "").toLowerCase().trim();

  // Exact subject match first
  for (const pattern of INTERVIEW_INVITE_SUBJECTS) {
    if (subject.includes(pattern)) {
      return { category: "interview_invite", isSmartDetected: false };
    }
  }
  for (const pattern of ENROLLMENT_INVITE_SUBJECTS) {
    if (subject.includes(pattern)) {
      return { category: "enrollment_invite", isSmartDetected: false };
    }
  }
  for (const pattern of INTERVIEW_REJECTION_SUBJECTS) {
    if (subject.includes(pattern)) {
      return { category: "interview_rejection", isSmartDetected: false };
    }
  }
  for (const pattern of INTERVIEW_REMINDER_SUBJECTS) {
    if (subject.includes(pattern)) {
      return { category: "interview_reminder", isSmartDetected: false };
    }
  }

  // Smart detection fallback
  for (const regex of SMART_INTERVIEW_PATTERNS) {
    if (regex.test(subject)) {
      return { category: "interview_invite", isSmartDetected: true };
    }
  }
  for (const regex of SMART_ENROLLMENT_PATTERNS) {
    if (regex.test(subject)) {
      return { category: "enrollment_invite", isSmartDetected: true };
    }
  }

  return { category: null, isSmartDetected: false };
}

function extractRecipients(msg: GraphMessage): string[] {
  const recipients = new Set<string>();
  for (const r of msg.toRecipients ?? []) {
    const addr = r.emailAddress?.address?.toLowerCase();
    if (addr) recipients.add(addr);
  }
  for (const r of msg.ccRecipients ?? []) {
    const addr = r.emailAddress?.address?.toLowerCase();
    if (addr) recipients.add(addr);
  }
  // Remove internal mailboxes from recipients
  for (const mb of MAILBOXES) {
    recipients.delete(mb);
  }
  return [...recipients];
}

// ── Customer lookup ────────────────────────────────────────────────────

async function loadCustomerEmailMap(): Promise<Map<string, CustomerRef>> {
  if (!supabase) throw new Error("Supabase client not initialised");

  const map = new Map<string, CustomerRef>();
  let offset = 0;
  const PAGE_SIZE = 500;

  while (true) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, email, funnel_status, cohort_statuses")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load customers: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.email) {
        map.set(row.email.toLowerCase(), {
          id: row.id,
          email: row.email,
          funnel_status: row.funnel_status,
          cohort_statuses: row.cohort_statuses ?? null,
        });
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return map;
}

/**
 * Find a customer by email. First tries direct match in the customer map,
 * then falls back to cohort_applications lookup.
 */
async function findCustomer(
  email: string,
  customerMap: Map<string, CustomerRef>
): Promise<CustomerRef | null> {
  if (!supabase) return null;

  const direct = customerMap.get(email.toLowerCase());
  if (direct) return direct;

  // Fall back to cohort_applications email → customer_id link
  const { data: app } = await supabase
    .from("cohort_applications")
    .select("customer_id")
    .eq("email", email.toLowerCase())
    .not("customer_id", "is", null)
    .limit(1)
    .single();

  if (!app?.customer_id) return null;

  const { data: customer } = await supabase
    .from("customers")
    .select("id, email, funnel_status, cohort_statuses")
    .eq("id", app.customer_id)
    .single();

  if (!customer) return null;

  return {
    id: customer.id,
    email: customer.email,
    funnel_status: customer.funnel_status,
    cohort_statuses: customer.cohort_statuses ?? null,
  };
}

// ── Cohort derivation ──────────────────────────────────────────────────

/**
 * Derive the cohort from a customer's cohort_statuses.
 * Returns the cohort with the most recent updated_at timestamp,
 * falling back to CURRENT_COHORT if no cohort_statuses exist.
 */
function deriveCohort(cohortStatuses: CohortStatuses | null): string {
  if (!cohortStatuses) return CURRENT_COHORT;

  const entries = Object.entries(cohortStatuses);
  if (entries.length === 0) return CURRENT_COHORT;

  // Find the entry with the most recent updated_at
  let mostRecent: { cohort: string; updatedAt: string } | null = null;
  for (const [cohort, entry] of entries) {
    if (!mostRecent || entry.updated_at > mostRecent.updatedAt) {
      mostRecent = { cohort, updatedAt: entry.updated_at };
    }
  }

  return mostRecent?.cohort ?? CURRENT_COHORT;
}

// ── Email persistence ──────────────────────────────────────────────────

/**
 * Persist an email record into the emails table for audit / history.
 * Deduplicates on (customer_id, sent_at, subject).
 * Returns the email row id if successful, null otherwise.
 */
async function upsertEmail(
  email: EmailMatch,
  customerId: string,
  emailType: string,
  cohort: string
): Promise<string | null> {
  if (!supabase || !customerId) return null;

  try {
    const row = {
      customer_id: customerId,
      direction: "outbound" as const,
      from_address: email.sender,
      to_addresses: [email.recipientEmail],
      subject: email.subject,
      email_type: emailType,
      sent_at: email.sentAt,
      cohort,
      updated_at: new Date().toISOString(),
    };

    // Deduplicate by customer_id + sent_at + subject
    const { data: existing } = await supabase
      .from("emails")
      .select("id")
      .eq("customer_id", customerId)
      .eq("sent_at", email.sentAt)
      .eq("subject", email.subject)
      .limit(1)
      .single();

    if (existing) {
      await supabase.from("emails").update(row).eq("id", existing.id);
      return existing.id;
    } else {
      const { data: inserted } = await supabase
        .from("emails")
        .insert(row)
        .select("id")
        .single();
      return inserted?.id ?? null;
    }
  } catch (err) {
    console.error(`Failed to upsert email for ${customerId}:`, err);
    return null;
  }
}

// ── Auto-reject pending automated emails ───────────────────────────────

async function autoRejectPendingEmails(
  customerId: string,
  triggerEvent: string
): Promise<number> {
  if (!supabase) return 0;

  try {
    const { data, error } = await supabase
      .from("pending_emails")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: "outlook_sync_auto",
        updated_at: new Date().toISOString(),
      })
      .eq("customer_id", customerId)
      .eq("trigger_event", triggerEvent)
      .eq("status", "pending")
      .select("id");

    if (error) {
      console.error(
        `Auto-reject pending emails failed for ${customerId} (${triggerEvent}):`,
        error
      );
      return 0;
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      console.log(
        `Auto-rejected ${count} pending email(s) for customer ${customerId} (trigger: ${triggerEvent})`
      );
    }
    return count;
  } catch (err) {
    console.error(
      `Auto-reject pending emails error for ${customerId}:`,
      err
    );
    return 0;
  }
}

// ── Pending funnel change creation ─────────────────────────────────────

/**
 * Queue a pending funnel change instead of auto-advancing.
 * Derives cohort from the customer's cohort_statuses (most recent entry),
 * falling back to CURRENT_COHORT.
 */
async function createPendingChange(
  customer: CustomerRef,
  targetStatus: string,
  result: SyncCategoryResult,
  recipientEmail: string,
  email: EmailMatch,
  emailId: string | null
): void {
  if (!supabase) return;

  const currentRank = FUNNEL_RANK[customer.funnel_status] ?? 0;
  const targetRank = FUNNEL_RANK[targetStatus] ?? 0;

  if (currentRank >= targetRank) {
    result.already_at_or_past++;
    result.details.push({
      email: recipientEmail,
      action: `already_at_${customer.funnel_status} (rank ${currentRank} >= ${targetRank})`,
    });
    return;
  }

  // Check for duplicate pending change (same customer + same proposed status)
  const { data: existingPending } = await supabase
    .from("pending_funnel_changes")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("proposed_status", targetStatus)
    .eq("status", "pending")
    .limit(1)
    .single();

  if (existingPending) {
    result.duplicate_pending++;
    result.details.push({
      email: recipientEmail,
      action: `duplicate_pending: ${customer.funnel_status} -> ${targetStatus} already queued`,
    });
    return;
  }

  // Derive cohort from customer's cohort_statuses
  const cohort = deriveCohort(customer.cohort_statuses);

  const { error } = await supabase
    .from("pending_funnel_changes")
    .insert({
      customer_id: customer.id,
      current_status: customer.funnel_status,
      proposed_status: targetStatus,
      trigger_type: "email_sync",
      trigger_detail: {
        subject: email.subject,
        sender: email.sender,
        recipient: email.recipientEmail,
        sent_at: email.sentAt,
      },
      email_id: emailId,
      cohort,
    });

  if (error) {
    throw new Error(
      `Failed to create pending change for ${recipientEmail}: ${error.message}`
    );
  }

  result.pending_changes++;
  result.details.push({
    email: recipientEmail,
    action: `pending: ${customer.funnel_status} -> ${targetStatus}`,
  });
}

// ── Process a single message ───────────────────────────────────────────

async function processMessage(
  msg: GraphMessage,
  category: "interview_invite" | "enrollment_invite" | "interview_rejection" | "interview_reminder",
  customerMap: Map<string, CustomerRef>,
  result: SyncCategoryResult
): Promise<void> {
  const recipients = extractRecipients(msg);
  const sender =
    msg.from?.emailAddress?.address?.toLowerCase() ?? "unknown";

  for (const recipientEmail of recipients) {
    try {
      const customer = await findCustomer(recipientEmail, customerMap);

      if (!customer) {
        result.no_customer_found++;
        result.details.push({
          email: recipientEmail,
          action: "no_customer_found",
        });
        continue;
      }

      result.matched++;

      const emailMatch: EmailMatch = {
        recipientEmail,
        subject: msg.subject ?? "",
        sentAt: msg.sentDateTime ?? new Date().toISOString(),
        sender,
      };

      // Derive cohort from customer's cohort_statuses for email storage
      const cohort = deriveCohort(customer.cohort_statuses);

      if (category === "interview_invite") {
        const emailId = await upsertEmail(
          emailMatch,
          customer.id,
          "invite_to_interview",
          cohort
        );
        result.auto_rejected_emails += await autoRejectPendingEmails(
          customer.id,
          "invited_to_interview"
        );
        await createPendingChange(
          customer,
          "invited_to_interview",
          result,
          recipientEmail,
          emailMatch,
          emailId
        );
      } else if (category === "enrollment_invite") {
        const emailId = await upsertEmail(
          emailMatch,
          customer.id,
          "invite_to_enrol",
          cohort
        );
        result.auto_rejected_emails += await autoRejectPendingEmails(
          customer.id,
          "invited_to_enrol"
        );
        await createPendingChange(
          customer,
          "invited_to_enrol",
          result,
          recipientEmail,
          emailMatch,
          emailId
        );
      } else if (category === "interview_rejection") {
        const emailId = await upsertEmail(
          emailMatch,
          customer.id,
          "interview_rejection",
          cohort
        );
        result.auto_rejected_emails += await autoRejectPendingEmails(
          customer.id,
          "interview_rejected"
        );
        await createPendingChange(
          customer,
          "interview_rejected",
          result,
          recipientEmail,
          emailMatch,
          emailId
        );
      } else if (category === "interview_reminder") {
        await upsertEmail(
          emailMatch,
          customer.id,
          "interview_reminder",
          cohort
        );
        result.details.push({
          email: recipientEmail,
          action: "stored_reminder",
        });
      }
    } catch (err) {
      result.errors.push(`${recipientEmail}: ${String(err)}`);
    }
  }
}

// ── Main handler ───────────────────────────────────────────────────────

function emptyCategoryResult(totalEmails: number): SyncCategoryResult {
  return {
    total_emails: totalEmails,
    matched: 0,
    pending_changes: 0,
    already_at_or_past: 0,
    duplicate_pending: 0,
    no_customer_found: 0,
    auto_rejected_emails: 0,
    errors: [],
    details: [],
  };
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  // Check secrets
  if (missingSecrets.length > 0) {
    return json(
      { error: `Missing secrets: ${missingSecrets.join(", ")}` },
      500
    );
  }

  if (!supabase) {
    return json({ error: "Supabase client not initialised" }, 500);
  }

  try {
    // Parse days_back from query string (default 3 for scheduled, 7 for manual)
    const url = new URL(req.url);
    const daysBack = parseInt(url.searchParams.get("days_back") ?? "3", 10);

    console.log(
      `Starting Outlook sync: ${daysBack} days back, mailboxes: ${MAILBOXES.join(", ")}`
    );

    // 1. Get MS Graph access token
    const accessToken = await getAccessToken();

    // 2. Fetch sent emails from all mailboxes
    const allMessages: GraphMessage[] = [];
    for (const mailbox of MAILBOXES) {
      const messages = await fetchSentEmails(accessToken, mailbox, daysBack);
      console.log(`Fetched ${messages.length} sent emails from ${mailbox}`);
      allMessages.push(...messages);
    }

    console.log(`Total emails fetched: ${allMessages.length}`);

    // 3. Classify emails
    const classified = {
      interview_invite: [] as GraphMessage[],
      enrollment_invite: [] as GraphMessage[],
      interview_rejection: [] as GraphMessage[],
      interview_reminder: [] as GraphMessage[],
    };

    let smartInterviewDetected = 0;
    let smartEnrollmentDetected = 0;

    for (const msg of allMessages) {
      const { category, isSmartDetected } = classifyEmail(msg);
      if (category) {
        classified[category].push(msg);
        if (isSmartDetected) {
          if (category === "interview_invite") smartInterviewDetected++;
          if (category === "enrollment_invite") smartEnrollmentDetected++;
        }
      }
    }

    console.log(
      `Classified: ${classified.interview_invite.length} interview invites, ` +
        `${classified.enrollment_invite.length} enrollment invites, ` +
        `${classified.interview_rejection.length} rejections, ` +
        `${classified.interview_reminder.length} reminders ` +
        `(smart: ${smartInterviewDetected} interview, ${smartEnrollmentDetected} enrollment)`
    );

    // 4. Load customer email map (with cohort_statuses)
    const customerMap = await loadCustomerEmailMap();
    console.log(`Loaded ${customerMap.size} customers`);

    // 5. Process each category
    const interviewResult = emptyCategoryResult(
      classified.interview_invite.length
    );
    for (const msg of classified.interview_invite) {
      await processMessage(msg, "interview_invite", customerMap, interviewResult);
    }

    const enrollmentResult = emptyCategoryResult(
      classified.enrollment_invite.length
    );
    for (const msg of classified.enrollment_invite) {
      await processMessage(
        msg,
        "enrollment_invite",
        customerMap,
        enrollmentResult
      );
    }

    const rejectionResult = emptyCategoryResult(
      classified.interview_rejection.length
    );
    for (const msg of classified.interview_rejection) {
      await processMessage(
        msg,
        "interview_rejection",
        customerMap,
        rejectionResult
      );
    }

    const reminderResult = emptyCategoryResult(
      classified.interview_reminder.length
    );
    for (const msg of classified.interview_reminder) {
      await processMessage(
        msg,
        "interview_reminder",
        customerMap,
        reminderResult
      );
    }

    // 6. Compile response
    const response = {
      emails_fetched: allMessages.length,
      interview_invites_found: classified.interview_invite.length,
      enrollment_invites_found: classified.enrollment_invite.length,
      smart_interview_detected: smartInterviewDetected,
      smart_enrollment_detected: smartEnrollmentDetected,
      emails_stored:
        interviewResult.matched +
        enrollmentResult.matched +
        rejectionResult.matched +
        reminderResult.matched,
      pending_changes_created:
        interviewResult.pending_changes +
        enrollmentResult.pending_changes +
        rejectionResult.pending_changes,
      already_at_or_past:
        interviewResult.already_at_or_past +
        enrollmentResult.already_at_or_past +
        rejectionResult.already_at_or_past,
      no_customer_found:
        interviewResult.no_customer_found +
        enrollmentResult.no_customer_found +
        rejectionResult.no_customer_found +
        reminderResult.no_customer_found,
      errors: [
        ...interviewResult.errors,
        ...enrollmentResult.errors,
        ...rejectionResult.errors,
        ...reminderResult.errors,
      ],
      interview_invites: interviewResult,
      enrollment_invites: enrollmentResult,
      interview_rejections: rejectionResult,
      interview_reminders: reminderResult,
    };

    console.log(
      `Sync complete: ${response.emails_stored} stored, ${response.pending_changes_created} pending changes, ${response.already_at_or_past} already at/past`
    );

    return json(response);
  } catch (err) {
    console.error("outlook-daily-sync error:", err);
    return json({ error: String(err) }, 500);
  }
});
