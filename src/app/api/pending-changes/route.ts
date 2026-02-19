/**
 * GET /api/pending-changes
 *
 * Returns all pending funnel changes enriched with customer data.
 * Protected by Auth0 (not in publicPaths).
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getSupabase()

    // Fetch pending changes with customer join
    const { data: changes, error } = await supabase
      .from('pending_funnel_changes')
      .select(`
        *,
        customers:customer_id (
          id,
          email,
          first_name,
          last_name,
          lead_type,
          funnel_status
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch pending changes:', error)
      return NextResponse.json(
        { error: 'Failed to fetch pending changes', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(changes ?? [])
  } catch (error) {
    console.error('Pending changes error:', error)
    return NextResponse.json(
      { error: 'Internal error', details: String(error) },
      { status: 500 }
    )
  }
}
