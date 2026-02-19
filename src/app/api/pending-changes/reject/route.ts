/**
 * POST /api/pending-changes/reject
 *
 * Rejects pending funnel changes without advancing customer statuses.
 *
 * Body: { ids: string[] }
 * Protected by Auth0 (not in publicPaths).
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/pending-changes/reject', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { ids } = await request.json()

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json(
          { error: 'ids array is required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('pending_funnel_changes')
        .update({
          status: 'rejected',
          reviewed_at: now,
          reviewed_by: 'dashboard_user',
          updated_at: now,
        })
        .in('id', ids)
        .eq('status', 'pending')

      if (error) {
        console.error('Failed to reject pending changes:', error)
        return NextResponse.json(
          { error: 'Rejection failed', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ rejected: ids.length })
    } catch (error) {
      console.error('Reject pending changes error:', error)
      return NextResponse.json(
        { error: 'Rejection failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
