/**
 * POST /api/interviews
 *
 * Smart upsert for interview records. If a Fathom-created row already exists
 * for the same email (matched by email + same-day conducted_at, or by
 * fathom_recording_id), updates that row with manual fields (outcome, notes,
 * cohort). Otherwise creates a new row.
 *
 * This works in tandem with the fathom-webhook edge function:
 *   - Fathom fires first (normal case) → creates row with transcript/summary
 *   - Interviewer submits form → updates that row with outcome/notes
 *   - OR: No Fathom recording → form creates a fresh row
 *
 * Funnel advancement is handled by the DB trigger trg_interview_sync
 * (advances to 'interviewed') plus explicit outcome-based advancement here
 * for 'approved' → invited_to_enrol and 'rejected' → interview_rejected.
 *
 * Body: {
 *   interviewee_email: string
 *   interviewee_name?: string
 *   interviewer: string
 *   conducted_at: string        // ISO date
 *   outcome?: 'approved' | 'rejected' | 'waitlisted' | 'pending'
 *   outcome_reason?: string
 *   interviewer_notes?: string
 *   cohort?: string
 * }
 */

import { NextResponse } from 'next/server'
import { getSupabase, FUNNEL_RANK } from '@/lib/supabase'
import { findOrCreateCustomer } from '@/lib/customer-sync'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/interviews', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const body = await request.json()

      const {
        interviewee_email,
        interviewee_name,
        interviewer,
        conducted_at,
        outcome,
        outcome_reason,
        interviewer_notes,
        cohort,
      } = body

      // Validate required fields
      if (!interviewee_email || !interviewer || !conducted_at) {
        return NextResponse.json(
          { error: 'interviewee_email, interviewer, and conducted_at are required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()
      const normEmail = interviewee_email.toLowerCase().trim()

      // 1. Find or create the customer
      const { customerId, created: customerCreated } = await findOrCreateCustomer(
        interviewee_email,
        interviewee_name
      )

      // 2. Try to match an existing booking by email
      let bookingId: string | null = null
      const { data: booking } = await supabase
        .from('interviews_booked')
        .select('id')
        .eq('interviewee_email', normEmail)
        .is('cancelled_at', null)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .single()

      if (booking) {
        bookingId = booking.id
      }

      // 3. Check for an existing interview row to update (Fathom-created or prior manual)
      //    Match by email + same calendar day. Prefer rows that have Fathom data.
      const conductedDate = new Date(conducted_at)
      const dayStart = new Date(Date.UTC(
        conductedDate.getUTCFullYear(),
        conductedDate.getUTCMonth(),
        conductedDate.getUTCDate(),
        0, 0, 0, 0
      ))
      const dayEnd = new Date(Date.UTC(
        conductedDate.getUTCFullYear(),
        conductedDate.getUTCMonth(),
        conductedDate.getUTCDate(),
        23, 59, 59, 999
      ))

      const { data: existingRows } = await supabase
        .from('interviews')
        .select('id, fathom_recording_id')
        .eq('interviewee_email', normEmail)
        .gte('conducted_at', dayStart.toISOString())
        .lte('conducted_at', dayEnd.toISOString())
        .order('fathom_recording_id', { ascending: false, nullsFirst: false })
        .limit(5)

      // Prefer the row with Fathom data if multiple exist
      const existingRow = existingRows?.find(r => r.fathom_recording_id != null)
        ?? existingRows?.[0]
        ?? null

      let interviewId: string
      let action: 'created' | 'updated'

      if (existingRow) {
        // 3a. UPDATE existing row with manual fields (preserve Fathom data)
        const updateFields: Record<string, unknown> = {
          customer_id: customerId,
          interviewee_name: interviewee_name || null,
          interviewer,
          outcome: outcome || 'pending',
          outcome_reason: outcome_reason || null,
          interviewer_notes: interviewer_notes || null,
          cohort: cohort || null,
          updated_at: new Date().toISOString(),
        }

        // Only set booking_id if not already set
        if (bookingId) {
          updateFields.booking_id = bookingId
        }

        const { error: updateErr } = await supabase
          .from('interviews')
          .update(updateFields)
          .eq('id', existingRow.id)

        if (updateErr) {
          return NextResponse.json(
            { error: 'Failed to update interview', details: updateErr.message },
            { status: 500 }
          )
        }

        interviewId = existingRow.id
        action = 'updated'
      } else {
        // 3b. INSERT new row (no existing Fathom or manual row for this email+day)
        const { data: interview, error: insertErr } = await supabase
          .from('interviews')
          .insert({
            customer_id: customerId,
            interviewee_name: interviewee_name || null,
            interviewee_email: normEmail,
            booking_id: bookingId,
            interviewer,
            conducted_at,
            outcome: outcome || 'pending',
            outcome_reason: outcome_reason || null,
            interviewer_notes: interviewer_notes || null,
            cohort: cohort || null,
            activity_type: 'demo',
          })
          .select('id')
          .single()

        if (insertErr || !interview) {
          return NextResponse.json(
            { error: 'Failed to insert interview', details: insertErr?.message },
            { status: 500 }
          )
        }

        interviewId = interview.id
        action = 'created'
      }

      // 4. Outcome-based funnel advancement
      //    The DB trigger trg_interview_sync handles basic 'interviewed' advancement.
      //    Here we handle outcome-specific statuses that the trigger doesn't cover:
      //    - approved → invited_to_enrol (rank 6)
      //    - rejected → interview_rejected (rank 5, lateral override)
      if (outcome === 'approved' || outcome === 'rejected') {
        const { data: customer } = await supabase
          .from('customers')
          .select('funnel_status, cohort_statuses')
          .eq('id', customerId)
          .single()

        if (customer) {
          const targetStatus = outcome === 'approved'
            ? 'invited_to_enrol'
            : 'interview_rejected'

          const proposedRank = FUNNEL_RANK[targetStatus] ?? 0

          if (cohort) {
            // Cohort-aware advancement
            const cohortStatuses = (customer.cohort_statuses ?? {}) as Record<string, { status: string; updated_at: string }>
            const currentCohortRank = FUNNEL_RANK[cohortStatuses[cohort]?.status ?? ''] ?? 0

            if (proposedRank > currentCohortRank) {
              const updatedCohortStatuses = {
                ...cohortStatuses,
                [cohort]: {
                  status: targetStatus,
                  updated_at: new Date().toISOString(),
                },
              }

              // Recalculate global best
              let bestRank = 0
              let bestStatus = 'registered'
              for (const [, entry] of Object.entries(updatedCohortStatuses) as [string, { status: string; updated_at: string }][]) {
                const r = FUNNEL_RANK[entry.status] ?? 0
                if (r > bestRank) { bestRank = r; bestStatus = entry.status }
              }

              const currentGlobalRank = FUNNEL_RANK[customer.funnel_status] ?? 0
              if (currentGlobalRank > bestRank) bestStatus = customer.funnel_status

              await supabase
                .from('customers')
                .update({
                  cohort_statuses: updatedCohortStatuses,
                  funnel_status: bestStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', customerId)
            }
          } else {
            // Non-cohort advancement
            const currentRank = FUNNEL_RANK[customer.funnel_status] ?? 0
            if (proposedRank > currentRank) {
              await supabase
                .from('customers')
                .update({
                  funnel_status: targetStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', customerId)
            }
          }
        }
      }

      return NextResponse.json({
        id: interviewId,
        action,
        customer_id: customerId,
        customer_created: customerCreated,
        booking_linked: !!bookingId,
        had_fathom_data: existingRow?.fathom_recording_id != null,
      })
    } catch (error) {
      console.error('Create interview error:', error)
      return NextResponse.json(
        { error: 'Internal error', details: String(error) },
        { status: 500 }
      )
    }
  }
)
