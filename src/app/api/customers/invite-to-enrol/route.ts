/**
 * POST /api/customers/invite-to-enrol
 *
 * Moves a customer from 'interviewed' to 'invited_to_enrol' via advance_funnel RPC,
 * then triggers the enrolment invite email automation via database trigger.
 *
 * Body: { customer_id: string, cohort?: string }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

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

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Invite to enrol error:', error)
      return NextResponse.json(
        { error: 'Failed to invite to enrol', details: String(error) },
        { status: 500 }
      )
    }
  }
)
