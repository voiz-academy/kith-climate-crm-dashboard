/**
 * POST /api/customers/set-enrollment-deadline
 *
 * Sets a manual enrollment deadline for a customer by calling the
 * set_enrollment_deadline RPC. This overrides the auto-computed
 * deadline (invite_sent_at + 7 days).
 *
 * Body: { customer_id: string, deadline: string (ISO datetime) }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/customers/set-enrollment-deadline', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { customer_id, deadline } = await request.json()

      if (!customer_id || typeof customer_id !== 'string') {
        return NextResponse.json(
          { error: 'customer_id is required' },
          { status: 400 }
        )
      }

      if (!deadline || typeof deadline !== 'string') {
        return NextResponse.json(
          { error: 'deadline is required (ISO date string)' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()

      const { error } = await supabase.rpc('set_enrollment_deadline', {
        p_customer_id: customer_id,
        p_deadline: deadline,
      })

      if (error) {
        console.error('Set enrollment deadline error:', error)
        return NextResponse.json(
          { error: 'Failed to set enrollment deadline', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Set enrollment deadline error:', error)
      return NextResponse.json(
        { error: 'Failed to set enrollment deadline', details: String(error) },
        { status: 500 }
      )
    }
  }
)
