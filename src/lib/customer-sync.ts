/**
 * Shared customer sync utilities.
 *
 * findOrCreateCustomer(email, name?) — look up a customer by email;
 * if not found, create a minimal row and return the new ID.
 *
 * Used by:
 *   - /api/interviews (manual interview insert)
 *   - /api/fathom/backfill (interview backfill)
 *   - Edge functions can replicate the same logic via raw SQL
 */

import { getSupabase } from './supabase'

interface FindOrCreateResult {
  customerId: string
  created: boolean
}

/**
 * Find an existing customer by email, or create one with the given name.
 * Always lowercases the email for lookup. If a new customer is created,
 * funnel_status defaults to 'registered' and enrichment_status to 'pending'.
 */
export async function findOrCreateCustomer(
  email: string,
  name?: string | null
): Promise<FindOrCreateResult> {
  const supabase = getSupabase()
  const normEmail = email.toLowerCase().trim()

  // Try to find existing customer
  const { data: existing, error: findErr } = await supabase
    .from('customers')
    .select('id')
    .eq('email', normEmail)
    .limit(1)
    .single()

  if (existing && !findErr) {
    return { customerId: existing.id, created: false }
  }

  // Split name into first/last if provided
  let firstName: string | null = null
  let lastName: string | null = null
  if (name) {
    const parts = name.trim().split(/\s+/)
    firstName = parts[0] || null
    lastName = parts.length > 1 ? parts.slice(1).join(' ') : null
  }

  // Create new customer
  const { data: inserted, error: insertErr } = await supabase
    .from('customers')
    .insert({
      email: normEmail,
      first_name: firstName,
      last_name: lastName,
      funnel_status: 'registered',
      enrichment_status: 'pending',
      lead_type: 'unknown',
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    throw new Error(`Failed to create customer for ${normEmail}: ${insertErr?.message}`)
  }

  return { customerId: inserted.id, created: true }
}

/**
 * Link orphaned satellite rows (where customer_id is NULL) to the correct
 * customer based on email. Returns counts of rows updated per table.
 */
export async function backfillOrphanedRows(): Promise<Record<string, number>> {
  const supabase = getSupabase()
  const results: Record<string, number> = {}

  // --- interviews ---
  {
    const { data: orphans } = await supabase
      .from('interviews')
      .select('id, interviewee_email')
      .is('customer_id', null)
      .not('interviewee_email', 'is', null)

    let linked = 0
    for (const row of orphans ?? []) {
      if (!row.interviewee_email) continue
      try {
        const { customerId } = await findOrCreateCustomer(row.interviewee_email)
        const { error } = await supabase
          .from('interviews')
          .update({ customer_id: customerId })
          .eq('id', row.id)
        if (!error) linked++
      } catch (err) {
        console.error(`Failed to backfill interviews row ${row.id}:`, err)
      }
    }
    results.interviews = linked
  }

  // --- cohort_applications ---
  {
    const { data: orphans } = await supabase
      .from('cohort_applications')
      .select('id, email')
      .is('customer_id', null)
      .not('email', 'is', null)

    let linked = 0
    for (const row of orphans ?? []) {
      if (!row.email) continue
      try {
        const { customerId } = await findOrCreateCustomer(row.email)
        const { error } = await supabase
          .from('cohort_applications')
          .update({ customer_id: customerId })
          .eq('id', row.id)
        if (!error) linked++
      } catch (err) {
        console.error(`Failed to backfill cohort_applications row ${row.id}:`, err)
      }
    }
    results.cohort_applications = linked
  }

  // --- interviews_booked ---
  {
    const { data: orphans } = await supabase
      .from('interviews_booked')
      .select('id, interviewee_email')
      .is('customer_id', null)
      .not('interviewee_email', 'is', null)

    let linked = 0
    for (const row of orphans ?? []) {
      if (!row.interviewee_email) continue
      try {
        const { customerId } = await findOrCreateCustomer(row.interviewee_email)
        const { error } = await supabase
          .from('interviews_booked')
          .update({ customer_id: customerId })
          .eq('id', row.id)
        if (!error) linked++
      } catch (err) {
        console.error(`Failed to backfill interviews_booked row ${row.id}:`, err)
      }
    }
    results.interviews_booked = linked
  }

  return results
}
