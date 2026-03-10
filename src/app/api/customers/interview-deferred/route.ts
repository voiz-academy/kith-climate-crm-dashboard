/**
 * POST /api/customers/interview-deferred
 *
 * Moves a customer to 'interview_deferred' by calling the
 * advance_funnel RPC. This is a lateral side status at the
 * invited_to_interview stage, meaning the candidate is deferred
 * to the next cohort's interview round.
 *
 * Body: { customer_id: string, cohort?: string }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/customers/interview-deferred', httpMethod: 'POST' },
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

      const { error } = await supabase.rpc('advance_funnel', {
        p_customer_id: customer_id,
        p_new_status: 'interview_deferred',
        p_cohort: cohort || null,
      })

      if (error) {
        console.error('Interview deferred error:', error)
        return NextResponse.json(
          { error: 'Failed to mark as interview deferred', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Interview deferred error:', error)
      return NextResponse.json(
        { error: 'Failed to mark as interview deferred', details: String(error) },
        { status: 500 }
      )
    }
  }
)
