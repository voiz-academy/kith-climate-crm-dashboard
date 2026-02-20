/**
 * GET /api/pending-interviews
 *
 * Returns all pending interview recordings flagged by the fathom-webhook
 * for manual review. These are Fathom meetings that passed hard filters
 * (2 attendees, no internal co-workers) but scored below the confidence
 * threshold in transcript analysis.
 *
 * Protected by Auth0 (not in publicPaths).
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const GET = withLogging(
  { functionName: 'api/pending-interviews', httpMethod: 'GET' },
  async () => {
    try {
      const supabase = getSupabase()

      const { data: pending, error } = await supabase
        .from('pending_interviews')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to fetch pending interviews:', error)
        return NextResponse.json(
          { error: 'Failed to fetch pending interviews', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json(pending ?? [])
    } catch (error) {
      console.error('Pending interviews error:', error)
      return NextResponse.json(
        { error: 'Internal error', details: String(error) },
        { status: 500 }
      )
    }
  }
)
