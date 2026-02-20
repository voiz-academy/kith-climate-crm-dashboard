/**
 * POST /api/pending-interviews/approve
 *
 * Approves a pending interview recording and inserts it into the interviews
 * table using the same flow as the fathom-webhook auto-insert path:
 * 1. Find or create customer by email
 * 2. Resolve matching booking
 * 3. Upsert into interviews table
 * 4. Mark pending row as approved
 *
 * The DB trigger trg_interview_sync handles funnel advancement to 'interviewed'.
 *
 * Body: { ids: string[] }
 * Protected by Auth0 (not in publicPaths).
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { findOrCreateCustomer } from '@/lib/customer-sync'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/pending-interviews/approve', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { ids } = await request.json()

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json(
          { error: 'ids array is required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()
      const results: Array<{ id: string; action: string; interview_id?: string }> = []

      for (const id of ids) {
        try {
          // 1. Fetch the pending interview
          const { data: pending, error: fetchErr } = await supabase
            .from('pending_interviews')
            .select('*')
            .eq('id', id)
            .eq('status', 'pending')
            .single()

          if (fetchErr || !pending) {
            results.push({ id, action: 'not_found_or_already_processed' })
            continue
          }

          // 2. Check if already inserted by fathom_recording_id (e.g. backfill ran)
          const { data: existingInterview } = await supabase
            .from('interviews')
            .select('id')
            .eq('fathom_recording_id', pending.fathom_recording_id)
            .limit(1)
            .single()

          if (existingInterview) {
            // Already exists in interviews — just mark as approved
            await supabase
              .from('pending_interviews')
              .update({
                status: 'approved',
                reviewed_at: new Date().toISOString(),
                reviewed_by: 'dashboard_user',
                review_note: 'Already existed in interviews table',
                updated_at: new Date().toISOString(),
              })
              .eq('id', id)

            results.push({
              id,
              action: 'already_exists',
              interview_id: existingInterview.id,
            })
            continue
          }

          // 3. Find or create customer
          let customerId: string | null = null
          if (pending.interviewee_email) {
            const { customerId: cid } = await findOrCreateCustomer(
              pending.interviewee_email,
              pending.interviewee_name
            )
            customerId = cid
          }

          // 4. Resolve matching booking
          let bookingId: string | null = null
          if (pending.interviewee_email) {
            const { data: booking } = await supabase
              .from('interviews_booked')
              .select('id')
              .eq('interviewee_email', pending.interviewee_email.toLowerCase().trim())
              .is('cancelled_at', null)
              .order('scheduled_at', { ascending: false })
              .limit(1)
              .single()

            if (booking) bookingId = booking.id
          }

          // 5. Insert into interviews table
          const { data: interview, error: insertErr } = await supabase
            .from('interviews')
            .insert({
              customer_id: customerId,
              interviewee_name: pending.interviewee_name,
              interviewee_email: pending.interviewee_email,
              booking_id: bookingId,
              fathom_recording_id: pending.fathom_recording_id,
              fathom_recording_url: pending.fathom_recording_url,
              fathom_summary: pending.fathom_summary,
              transcript: pending.transcript,
              interviewer: pending.interviewer,
              conducted_at: pending.conducted_at,
              activity_type: pending.activity_type || 'demo',
              cohort: pending.cohort,
            })
            .select('id')
            .single()

          if (insertErr || !interview) {
            results.push({
              id,
              action: `insert_failed: ${insertErr?.message ?? 'unknown error'}`,
            })
            continue
          }

          // 6. Mark pending row as approved
          await supabase
            .from('pending_interviews')
            .update({
              status: 'approved',
              reviewed_at: new Date().toISOString(),
              reviewed_by: 'dashboard_user',
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)

          results.push({
            id,
            action: 'approved_and_inserted',
            interview_id: interview.id,
          })
        } catch (itemErr) {
          results.push({
            id,
            action: `error: ${String(itemErr)}`,
          })
        }
      }

      return NextResponse.json({ results })
    } catch (error) {
      console.error('Approve pending interviews error:', error)
      return NextResponse.json(
        { error: 'Approval failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
