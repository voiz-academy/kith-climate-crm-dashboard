/**
 * POST /api/interviews
 *
 * Manually create an interview record. Finds or creates a customer by email,
 * auto-links to an existing booking (interviews_booked) by email match,
 * and advances funnel to 'interviewed'.
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
        .eq('interviewee_email', interviewee_email.toLowerCase().trim())
        .is('cancelled_at', null)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .single()

      if (booking) {
        bookingId = booking.id
      }

      // 3. Insert the interview record
      const { data: interview, error: insertErr } = await supabase
        .from('interviews')
        .insert({
          customer_id: customerId,
          interviewee_name: interviewee_name || null,
          interviewee_email: interviewee_email.toLowerCase().trim(),
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

      if (insertErr) {
        return NextResponse.json(
          { error: 'Failed to insert interview', details: insertErr.message },
          { status: 500 }
        )
      }

      // 4. Advance funnel to 'interviewed' (respecting rank system)
      const { data: customer } = await supabase
        .from('customers')
        .select('funnel_status, cohort_statuses')
        .eq('id', customerId)
        .single()

      if (customer) {
        const targetStatus = outcome === 'approved'
          ? 'invited_to_enrol'
          : outcome === 'rejected'
            ? 'interview_rejected'
            : 'interviewed'

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

      return NextResponse.json({
        id: interview.id,
        customer_id: customerId,
        customer_created: customerCreated,
        booking_linked: !!bookingId,
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
