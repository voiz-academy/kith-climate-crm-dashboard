/**
 * POST /api/customers/offer-expired
 *
 * Moves a customer to 'offer_expired' by calling the
 * advance_funnel RPC. The database function handles lateral status
 * overrides for side statuses like offer_expired.
 *
 * Body: { customer_id: string, cohort?: string }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/customers/offer-expired', httpMethod: 'POST' },
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
        p_new_status: 'offer_expired',
        p_cohort: cohort || null,
      })

      if (error) {
        console.error('Offer expired error:', error)
        return NextResponse.json(
          { error: 'Failed to mark as offer expired', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Offer expired error:', error)
      return NextResponse.json(
        { error: 'Failed to mark as offer expired', details: String(error) },
        { status: 500 }
      )
    }
  }
)
