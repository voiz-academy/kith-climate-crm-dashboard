/**
 * POST /api/pending-emails/reject
 *
 * Rejects pending emails (does not send them).
 *
 * Body: { ids: string[] }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/pending-emails/reject', httpMethod: 'POST' },
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
      const results: Array<{ id: string; action: string }> = []

      for (const id of ids) {
        const { error } = await supabase
          .from('pending_emails')
          .update({
            status: 'rejected',
            reviewed_at: new Date().toISOString(),
            reviewed_by: 'dashboard_user',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('status', 'pending')

        if (error) {
          results.push({ id, action: `error: ${error.message}` })
        } else {
          results.push({ id, action: 'rejected' })
        }
      }

      return NextResponse.json({ results })
    } catch (error) {
      console.error('Reject pending emails error:', error)
      return NextResponse.json(
        { error: 'Rejection failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
