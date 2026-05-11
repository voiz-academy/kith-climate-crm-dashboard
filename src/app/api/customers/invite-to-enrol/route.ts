/**
 * POST /api/customers/invite-to-enrol
 *
 * Moves a customer from 'interviewed' to 'invited_to_enrol' via advance_funnel RPC,
 * sets enrollment_deadline to 2 business days from now, then triggers the
 * enrolment invite email automation via database trigger.
 *
 * Body: { customer_id: string, cohort?: string }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

/** Calculate a date N business days from now (skips weekends) */
function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

/** Format date as "April 9, 2026" */
function formatDeadline(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const POST = withLogging(
  { functionName: 'api/customers/invite-to-enrol', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { customer_id, cohort } = await request.json()

      if (!customer_id || typeof customer_id !== 'string') {
        return NextResponse.json(
          { error: 'customer_id is required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()

      const { data: customer, error: custErr } = await supabase
        .from('customers')
        .select('id, funnel_status')
        .eq('id', customer_id)
        .single()

      if (custErr || !customer) {
        return NextResponse.json(
          { error: 'Customer not found', details: custErr?.message },
          { status: 404 }
        )
      }

      // Set enrollment deadline to 2 business days from now
      const deadline = addBusinessDays(new Date(), 2)
      const deadlineFormatted = formatDeadline(deadline)

      const { error: deadlineErr } = await supabase
        .from('customers')
        .update({ enrollment_deadline: deadlineFormatted })
        .eq('id', customer_id)

      if (deadlineErr) {
        console.error('Set enrollment deadline error:', deadlineErr)
      }

      // Advance funnel (triggers email automation via DB trigger)
      const { error } = await supabase.rpc('advance_funnel', {
        p_customer_id: customer_id,
        p_new_status: 'invited_to_enrol',
        p_cohort: cohort || null,
      })

      if (error) {
        console.error('Invite to enrol error:', error)
        return NextResponse.json(
          { error: 'Failed to invite to enrol', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, enrollment_deadline: deadlineFormatted })
    } catch (error) {
      console.error('Invite to enrol error:', error)
      return NextResponse.json(
        { error: 'Failed to invite to enrol', details: String(error) },
        { status: 500 }
      )
    }
  }
)
