/**
 * POST /api/customers/stale-application
 *
 * Moves a customer to 'stale_application' by calling the
 * advance_funnel RPC. This is a lateral side status at the
 * invited_to_interview stage for candidates who never engaged
 * after being invited and aren't a deferral.
 *
 * Body: { customer_id: string, cohort?: string }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/customers/stale-application', httpMethod: 'POST' },
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
        p_new_status: 'stale_application',
        p_cohort: cohort || null,
      })

      if (error) {
        console.error('Stale application error:', error)
        return NextResponse.json(
          { error: 'Failed to mark as stale application', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Stale application error:', error)
      return NextResponse.json(
        { error: 'Failed to mark as stale application', details: String(error) },
        { status: 500 }
      )
    }
  }
)
