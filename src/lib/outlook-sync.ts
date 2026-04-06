/**
 * Outlook Email Sync — matching logic for interview invites, enrollment invites,
 * and interview rejections.
 *
 * Emails are stored immediately. Funnel changes are queued as pending
 * in `pending_funnel_changes` for manual approval via the Funnel page UI.
 *
 * Interview invites:
 *   Subject: "Interview Invite: Kith Climate"
 *   From: ben@kithailab.com
 *   Recipients → matched against cohort_applications.email → propose invited_to_interview
 *
 * Enrollment invites:
 *   Subjects: "Kith Climate: Cohort Invitation", "Cohort Acceptance",
 *             "Cohort Enrollment", "Kith Climate Enrollment"
 *   From: ben@kithailab.com OR diego@kithailab.com
 *   Recipients → matched against customers.email → propose invited_to_enrol
 *
 * Interview rejections:
 *   Subjects: "Interview Feedback", "Kith Climate: Interview Feedback",
 *             "Interview Update", "Kith Climate: Interview Update"
 *   From: ben@kithailab.com OR diego@kithailab.com
 *   Recipients → matched against customers.email → propose interview_rejected
 */

import { getSupabase, FUNNEL_RANK, COHORT_OPTIONS } from './supabase'

/** The currently active cohort — used as default when email has no cohort */
const CURRENT_COHORT = COHORT_OPTIONS[1].value // 'May 18th 2026'

export type EmailMatch = {
  recipientEmail: string
  subject: string
  sentAt: string
  sender: string
}

type SyncCategoryResult = {
  total_emails: number
  matched: number
  pending_changes: number
  already_at_or_past: number
  duplicate_pending: number
  no_customer_found: number
  auto_rejected_emails: number
  errors: string[]
  details: Array<{ email: string; action: string }>
}

export type SyncResult = {
  interview_invites: SyncCategoryResult
  enrollment_invites: SyncCategoryResult
  interview_rejections: SyncCategoryResult
  interview_reminders: SyncCategoryResult
}

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
  }
}

/**
 * Process interview invite emails — store emails and queue pending funnel changes.
 */
export async function syncInterviewInvites(
  emails: EmailMatch[]
): Promise<SyncCategoryResult> {
  const result = emptyCategoryResult(emails.length)

  // Deduplicate by recipient email (keep earliest send date)
  const emailMap = new Map<string, EmailMatch>()
  for (const email of emails) {
    const key = email.recipientEmail.toLowerCase()
    if (!emailMap.has(key) || email.sentAt < emailMap.get(key)!.sentAt) {
      emailMap.set(key, email)
    }
  }

  for (const [recipientEmail, email] of emailMap) {
    try {
      // Find customer by email
      const { data: customer, error: custErr } = await getSupabase()
        .from('customers')
        .select('id, email, funnel_status')
        .eq('email', recipientEmail)
        .single()

      if (custErr || !customer) {
        // Try matching via cohort_applications
        const { data: app } = await getSupabase()
          .from('cohort_applications')
          .select('customer_id')
          .eq('email', recipientEmail)
          .not('customer_id', 'is', null)
          .limit(1)
          .single()

        if (!app?.customer_id) {
          result.no_customer_found++
          result.details.push({ email: recipientEmail, action: 'no_customer_found' })
          continue
        }

        // Fetch the customer via application link
        const { data: linkedCustomer } = await getSupabase()
          .from('customers')
          .select('id, email, funnel_status')
          .eq('id', app.customer_id)
          .single()

        if (!linkedCustomer) {
          result.no_customer_found++
          result.details.push({ email: recipientEmail, action: 'no_customer_found' })
          continue
        }

        result.matched++
        const emailId = await upsertEmail(email, linkedCustomer.id, 'invite_to_interview')
        result.auto_rejected_emails += await autoRejectPendingEmails(linkedCustomer.id, 'invited_to_interview')
        await createPendingChange(linkedCustomer, 'invited_to_interview', result, recipientEmail, email, emailId)
        continue
      }

      result.matched++
      const emailId = await upsertEmail(email, customer.id, 'invite_to_interview')
      result.auto_rejected_emails += await autoRejectPendingEmails(customer.id, 'invited_to_interview')
      await createPendingChange(customer, 'invited_to_interview', result, recipientEmail, email, emailId)
    } catch (err) {
      result.errors.push(`${recipientEmail}: ${String(err)}`)
    }
  }

  return result
}

/**
 * Process enrollment invite emails — store emails and queue pending funnel changes.
 */
export async function syncEnrollmentInvites(
  emails: EmailMatch[]
): Promise<SyncCategoryResult> {
  const result = emptyCategoryResult(emails.length)

  // Deduplicate by recipient email
  const emailMap = new Map<string, EmailMatch>()
  for (const email of emails) {
    const key = email.recipientEmail.toLowerCase()
    if (!emailMap.has(key) || email.sentAt < emailMap.get(key)!.sentAt) {
      emailMap.set(key, email)
    }
  }

  for (const [recipientEmail, email] of emailMap) {
    try {
      const { data: customer, error: custErr } = await getSupabase()
        .from('customers')
        .select('id, email, funnel_status')
        .eq('email', recipientEmail)
        .single()

      if (custErr || !customer) {
        result.no_customer_found++
        result.details.push({ email: recipientEmail, action: 'no_customer_found' })
        continue
      }

      result.matched++
      const emailId = await upsertEmail(email, customer.id, 'invite_to_enrol')
      result.auto_rejected_emails += await autoRejectPendingEmails(customer.id, 'invited_to_enrol')
      await createPendingChange(customer, 'invited_to_enrol', result, recipientEmail, email, emailId)
    } catch (err) {
      result.errors.push(`${recipientEmail}: ${String(err)}`)
    }
  }

  return result
}

/**
 * Process interview rejection emails — store emails and queue pending funnel changes.
 */
export async function syncInterviewRejections(
  emails: EmailMatch[]
): Promise<SyncCategoryResult> {
  const result = emptyCategoryResult(emails.length)

  // Deduplicate by recipient email (keep earliest send date)
  const emailMap = new Map<string, EmailMatch>()
  for (const email of emails) {
    const key = email.recipientEmail.toLowerCase()
    if (!emailMap.has(key) || email.sentAt < emailMap.get(key)!.sentAt) {
      emailMap.set(key, email)
    }
  }

  for (const [recipientEmail, email] of emailMap) {
    try {
      const { data: customer, error: custErr } = await getSupabase()
        .from('customers')
        .select('id, email, funnel_status')
        .eq('email', recipientEmail)
        .single()

      if (custErr || !customer) {
        result.no_customer_found++
        result.details.push({ email: recipientEmail, action: 'no_customer_found' })
        continue
      }

      result.matched++
      const emailId = await upsertEmail(email, customer.id, 'interview_rejection')
      result.auto_rejected_emails += await autoRejectPendingEmails(customer.id, 'interview_rejected')
      await createPendingChange(customer, 'interview_rejected', result, recipientEmail, email, emailId)
    } catch (err) {
      result.errors.push(`${recipientEmail}: ${String(err)}`)
    }
  }

  return result
}

/**
 * Process interview reminder emails — store emails only, no funnel changes.
 * Reminders don't advance the funnel; they just need to be recorded so
 * the dashboard can show how many times a customer has been reminded.
 */
export async function syncInterviewReminders(
  emails: EmailMatch[]
): Promise<SyncCategoryResult> {
  const result = emptyCategoryResult(emails.length)

  for (const email of emails) {
    const recipientEmail = email.recipientEmail.toLowerCase()
    try {
      // Find customer by email
      const { data: customer, error: custErr } = await getSupabase()
        .from('customers')
        .select('id, email, funnel_status')
        .eq('email', recipientEmail)
        .single()

      if (custErr || !customer) {
        // Try matching via cohort_applications
        const { data: app } = await getSupabase()
          .from('cohort_applications')
          .select('customer_id')
          .eq('email', recipientEmail)
          .not('customer_id', 'is', null)
          .limit(1)
          .single()

        if (!app?.customer_id) {
          result.no_customer_found++
          result.details.push({ email: recipientEmail, action: 'no_customer_found' })
          continue
        }

        result.matched++
        await upsertEmail(email, app.customer_id, 'interview_reminder')
        result.details.push({ email: recipientEmail, action: 'stored_reminder' })
        continue
      }

      result.matched++
      await upsertEmail(email, customer.id, 'interview_reminder')
      result.details.push({ email: recipientEmail, action: 'stored_reminder' })
    } catch (err) {
      result.errors.push(`${recipientEmail}: ${String(err)}`)
    }
  }

  return result
}

/**
 * Persist an email record into the emails table for audit / history.
 * Deduplicates on (customer_id, sent_at, subject).
 * Returns the email row id if successful, null otherwise.
 * Errors are logged but never thrown — email persistence must not block pending change creation.
 */
async function upsertEmail(
  email: EmailMatch,
  customerId: string,
  emailType: string
): Promise<string | null> {
  if (!customerId) return null

  try {
    const row = {
      customer_id: customerId,
      direction: 'outbound' as const,
      from_address: email.sender,
      to_addresses: [email.recipientEmail],
      subject: email.subject,
      email_type: emailType,
      sent_at: email.sentAt,
      cohort: CURRENT_COHORT,
      updated_at: new Date().toISOString(),
    }

    // Deduplicate by customer_id + sent_at + subject
    const { data: existing } = await getSupabase()
      .from('emails')
      .select('id')
      .eq('customer_id', customerId)
      .eq('sent_at', email.sentAt)
      .eq('subject', email.subject)
      .limit(1)
      .single()

    if (existing) {
      await getSupabase().from('emails').update(row).eq('id', existing.id)
      return existing.id
    } else {
      const { data: inserted } = await getSupabase()
        .from('emails')
        .insert(row)
        .select('id')
        .single()
      return inserted?.id ?? null
    }
  } catch (err) {
    // Log but do not throw — email persistence is best-effort
    console.error(`Failed to upsert email for ${customerId}:`, err)
    return null
  }
}

/**
 * Auto-reject any pending automated emails for this customer that match the
 * given trigger event. Called when Outlook sync detects a manually sent email
 * that covers the same communication (e.g., a manual interview invite makes
 * the automated interview invite redundant).
 *
 * Uses anon UPDATE directly — pending_emails RLS policy allows anon UPDATE.
 * If that policy is ever tightened, route through kith-climate-pending-email-review instead.
 */
async function autoRejectPendingEmails(
  customerId: string,
  triggerEvent: string
): Promise<number> {
  try {
    const { data, error } = await getSupabase()
      .from('pending_emails')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'outlook_sync_auto',
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', customerId)
      .eq('trigger_event', triggerEvent)
      .eq('status', 'pending')
      .select('id')

    if (error) {
      console.error(`Auto-reject pending emails failed for ${customerId} (${triggerEvent}):`, error)
      return 0
    }

    const count = data?.length ?? 0
    if (count > 0) {
      console.log(`Auto-rejected ${count} pending email(s) for customer ${customerId} (trigger: ${triggerEvent})`)
    }
    return count
  } catch (err) {
    console.error(`Auto-reject pending emails error for ${customerId}:`, err)
    return 0
  }
}

/**
 * Queue a pending funnel change instead of auto-advancing.
 * Skips if the customer is already at or past the target rank,
 * or if an identical pending change already exists.
 */
async function createPendingChange(
  customer: { id: string; email: string; funnel_status: string },
  targetStatus: string,
  result: SyncCategoryResult,
  recipientEmail: string,
  email: EmailMatch,
  emailId: string | null
) {
  const currentRank = FUNNEL_RANK[customer.funnel_status] ?? 0
  const targetRank = FUNNEL_RANK[targetStatus] ?? 0

  if (currentRank >= targetRank) {
    result.already_at_or_past++
    result.details.push({
      email: recipientEmail,
      action: `already_at_${customer.funnel_status} (rank ${currentRank} >= ${targetRank})`,
    })
    return
  }

  // Check for duplicate pending change (same customer + same proposed status)
  const { data: existingPending } = await getSupabase()
    .from('pending_funnel_changes')
    .select('id')
    .eq('customer_id', customer.id)
    .eq('proposed_status', targetStatus)
    .eq('status', 'pending')
    .limit(1)
    .single()

  if (existingPending) {
    result.duplicate_pending++
    result.details.push({
      email: recipientEmail,
      action: `duplicate_pending: ${customer.funnel_status} → ${targetStatus} already queued`,
    })
    return
  }

  const { error } = await getSupabase()
    .from('pending_funnel_changes')
    .insert({
      customer_id: customer.id,
      current_status: customer.funnel_status,
      proposed_status: targetStatus,
      trigger_type: 'email_sync',
      trigger_detail: {
        subject: email.subject,
        sender: email.sender,
        recipient: email.recipientEmail,
        sent_at: email.sentAt,
      },
      email_id: emailId,
      cohort: CURRENT_COHORT,
    })

  if (error) {
    throw new Error(`Failed to create pending change for ${recipientEmail}: ${error.message}`)
  }

  result.pending_changes++
  result.details.push({
    email: recipientEmail,
    action: `pending: ${customer.funnel_status} → ${targetStatus}`,
  })
}
