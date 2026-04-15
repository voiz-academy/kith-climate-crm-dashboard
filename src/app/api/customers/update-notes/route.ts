/**
 * POST /api/customers/update-notes
 *
 * Saves free-form CRM notes on a customer. Calls the
 * kith_climate.update_customer_notes RPC (SECURITY DEFINER), matching the
 * same anon-key + RPC pattern used by advance_funnel.
 *
 * Body: { customer_id: string, notes: string | null }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/customers/update-notes', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { customer_id, notes } = await request.json()

      if (!customer_id || typeof customer_id !== 'string') {
        return NextResponse.json(
          { error: 'customer_id is required' },
          { status: 400 }
        )
      }

      if (notes !== null && typeof notes !== 'string') {
        return NextResponse.json(
          { error: 'notes must be a string or null' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()

      const { error } = await supabase.rpc('update_customer_notes', {
        p_customer_id: customer_id,
        p_notes: notes ?? null,
      })

      if (error) {
        console.error('Update notes error:', error)
        return NextResponse.json(
          { error: 'Failed to update notes', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Update notes error:', error)
      return NextResponse.json(
        { error: 'Failed to update notes', details: String(error) },
        { status: 500 }
      )
    }
  }
)
