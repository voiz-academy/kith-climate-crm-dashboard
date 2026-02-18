/**
 * Outlook Email Sync — matching logic for interview & enrollment invites.
 *
 * Interview invites:
 *   Subject: "Interview Invite: Kith Climate"
 *   From: ben@kithailab.com
 *   Recipients → matched against cohort_applications.email → advance to invited_to_interview
 *
 * Enrollment invites:
 *   Subjects: "Kith Climate: Cohort Invitation", "Cohort Acceptance",
 *             "Cohort Enrollment", "Kith Climate Enrollment"
 *   From: ben@kithailab.com OR diego@kithailab.com
 *   Recipients → matched against customers.email → advance to invited_to_enrol
 */

import { supabase } from './supabase'

export type EmailMatch = {
  recipientEmail: string
  subject: string
  sentAt: string
  sender: string
}

export type SyncResult = {
  interview_invites: {
    total_emails: number
    matched: number
    advanced: number
    already_at_or_past: number
    no_customer_found: number
    errors: string[]
    details: Array<{ email: string; action: string }>
  }
  enrollment_invites: {
    total_emails: number
    matched: number
    advanced: number
    already_at_or_past: number
    no_customer_found: number
    errors: string[]
    details: Array<{ email: string; action: string }>
  }
}

// Ranks for comparison — must match DB funnel_rank function
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
  enrolled: 7,
}

/**
 * Process interview invite emails — advance matching customers to invited_to_interview.
 */
export async function syncInterviewInvites(
  emails: EmailMatch[]
): Promise<SyncResult['interview_invites']> {
  const result: SyncResult['interview_invites'] = {
    total_emails: emails.length,
    matched: 0,
    advanced: 0,
    already_at_or_past: 0,
    no_customer_found: 0,
    errors: [],
    details: [],
  }

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
      const { data: customer, error: custErr } = await supabase
        .from('customers')
        .select('id, email, funnel_status')
        .eq('email', recipientEmail)
        .single()

      if (custErr || !customer) {
        // Try matching via cohort_applications
        const { data: app } = await supabase
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
        const { data: linkedCustomer } = await supabase
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
        await advanceCustomer(linkedCustomer, 'invited_to_interview', result, recipientEmail)
        await upsertEmail(email, linkedCustomer.id, 'invite_to_interview')
        continue
      }

      result.matched++
      await advanceCustomer(customer, 'invited_to_interview', result, recipientEmail)
      await upsertEmail(email, customer.id, 'invite_to_interview')
    } catch (err) {
      result.errors.push(`${recipientEmail}: ${String(err)}`)
    }
  }

  return result
}

/**
 * Process enrollment invite emails — advance matching customers to invited_to_enrol.
 */
export async function syncEnrollmentInvites(
  emails: EmailMatch[]
): Promise<SyncResult['enrollment_invites']> {
  const result: SyncResult['enrollment_invites'] = {
    total_emails: emails.length,
    matched: 0,
    advanced: 0,
    already_at_or_past: 0,
    no_customer_found: 0,
    errors: [],
    details: [],
  }

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
      const { data: customer, error: custErr } = await supabase
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
      await advanceCustomer(customer, 'invited_to_enrol', result, recipientEmail)
      await upsertEmail(email, customer.id, 'invite_to_enrol')
    } catch (err) {
      result.errors.push(`${recipientEmail}: ${String(err)}`)
    }
  }

  return result
}

/**
 * Persist an email record into the emails table for audit / history.
 * Deduplicates on (customer_id, sent_at, subject).
 * Errors are logged but never thrown — email persistence must not block funnel advancement.
 */
async function upsertEmail(email: EmailMatch, customerId: string, emailType: string) {
  if (!customerId) return

  try {
    const row = {
      customer_id: customerId,
      direction: 'outbound' as const,
      from_address: email.sender,
      to_addresses: [email.recipientEmail],
      subject: email.subject,
      email_type: emailType,
      sent_at: email.sentAt,
      cohort: 'march-2026',
      updated_at: new Date().toISOString(),
    }

    // Deduplicate by customer_id + sent_at + subject
    const { data: existing } = await supabase
      .from('emails')
      .select('id')
      .eq('customer_id', customerId)
      .eq('sent_at', email.sentAt)
      .eq('subject', email.subject)
      .limit(1)
      .single()

    if (existing) {
      await supabase.from('emails').update(row).eq('id', existing.id)
    } else {
      await supabase.from('emails').insert(row)
    }
  } catch (err) {
    // Log but do not throw — email persistence is best-effort
    console.error(`Failed to upsert email for ${customerId}:`, err)
  }
}

/**
 * Advance a customer's funnel_status if the target status is higher rank.
 */
async function advanceCustomer(
  customer: { id: string; email: string; funnel_status: string },
  targetStatus: string,
  result: { advanced: number; already_at_or_past: number; details: Array<{ email: string; action: string }> },
  recipientEmail: string
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

  const { error } = await supabase
    .from('customers')
    .update({
      funnel_status: targetStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customer.id)

  if (error) {
    throw new Error(`Failed to advance ${recipientEmail}: ${error.message}`)
  }

  result.advanced++
  result.details.push({
    email: recipientEmail,
    action: `advanced: ${customer.funnel_status} → ${targetStatus}`,
  })
}
