/**
 * POST /api/customers/invite-to-interview
 *
 * Moves a customer from 'applied' to 'invited_to_interview' via advance_funnel RPC,
 * then triggers the interview_invite email automation.
 *
 * Body: { customer_id: string, cohort?: string }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'
import { triggerEmailAutomation } from '@/lib/email-automation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/customers/invite-to-interview', httpMethod: 'POST' },
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

      // Get current status before advancing
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

      const oldStatus = customer.funnel_status

      const { error } = await supabase.rpc('advance_funnel', {
        p_customer_id: customer_id,
        p_new_status: 'invited_to_interview',
        p_cohort: cohort || null,
      })

      if (error) {
        console.error('Invite to interview error:', error)
        return NextResponse.json(
          { error: 'Failed to invite to interview', details: error.message },
          { status: 500 }
        )
      }

      // Trigger email automation (fire-and-forget)
      triggerEmailAutomation({
        customer_id,
        new_status: 'invited_to_interview',
        old_status: oldStatus,
        cohort: cohort || undefined,
      }).catch((err) => {
        console.error(`Automation trigger failed for ${customer_id}:`, err)
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Invite to interview error:', error)
      return NextResponse.json(
        { error: 'Failed to invite to interview', details: String(error) },
        { status: 500 }
      )
    }
  }
)
