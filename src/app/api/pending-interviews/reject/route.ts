/**
 * POST /api/pending-interviews/reject
 *
 * Rejects pending interview recordings without inserting them into
 * the interviews table. The Fathom recording is discarded.
 *
 * Body: { ids: string[], review_note?: string }
 * Protected by Auth0 (not in publicPaths).
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/pending-interviews/reject', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { ids, review_note } = await request.json()

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json(
          { error: 'ids array is required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('pending_interviews')
        .update({
          status: 'rejected',
          reviewed_at: now,
          reviewed_by: 'dashboard_user',
          review_note: review_note || null,
          updated_at: now,
        })
        .in('id', ids)
        .eq('status', 'pending')

      if (error) {
        console.error('Failed to reject pending interviews:', error)
        return NextResponse.json(
          { error: 'Rejection failed', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ rejected: ids.length })
    } catch (error) {
      console.error('Reject pending interviews error:', error)
      return NextResponse.json(
        { error: 'Rejection failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
