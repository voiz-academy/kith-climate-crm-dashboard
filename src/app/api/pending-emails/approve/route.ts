/**
 * POST /api/pending-emails/approve
 *
 * Approves pending emails and sends them via the edge function.
 *
 * Body: { ids: string[] }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'
import { sendPendingEmail } from '@/lib/email-automation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/pending-emails/approve', httpMethod: 'POST' },
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
        // Send the email
        const { success, error: sendErr } = await sendPendingEmail(id)

        if (!success) {
          results.push({ id, action: `send_failed: ${sendErr}` })
          continue
        }

        // Mark as approved
        const { error: updateErr } = await supabase
          .from('pending_emails')
          .update({
            status: 'approved',
            reviewed_at: new Date().toISOString(),
            reviewed_by: 'dashboard_user',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        if (updateErr) {
          results.push({ id, action: `approved_but_update_failed: ${updateErr.message}` })
        } else {
          results.push({ id, action: 'approved_and_sent' })
        }
      }

      return NextResponse.json({ results })
    } catch (error) {
      console.error('Approve pending emails error:', error)
      return NextResponse.json(
        { error: 'Approval failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
