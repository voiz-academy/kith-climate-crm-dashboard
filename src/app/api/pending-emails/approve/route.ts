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

      let hasFailures = false

      for (const id of ids) {
        // Send the email
        const { success, error: sendErr } = await sendPendingEmail(id)

        if (!success) {
          console.error(`[pending-emails/approve] Send failed for ${id}: ${sendErr}`)
          results.push({ id, action: `send_failed: ${sendErr}` })
          hasFailures = true
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

      // Return 207 Multi-Status if some failed, so the UI knows
      const status = hasFailures ? 207 : 200
      return NextResponse.json({ results }, { status })
    } catch (error) {
      console.error('Approve pending emails error:', error)
      return NextResponse.json(
        { error: 'Approval failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
