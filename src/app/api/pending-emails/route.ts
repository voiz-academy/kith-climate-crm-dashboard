/**
 * GET /api/pending-emails
 *
 * Returns all pending email approvals enriched with customer and template data.
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const GET = withLogging(
  { functionName: 'api/pending-emails', httpMethod: 'GET' },
  async () => {
    try {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from('pending_emails')
        .select(`
          *,
          customers:customer_id (
            id,
            email,
            first_name,
            last_name,
            funnel_status
          ),
          email_templates:template_id (
            id,
            name,
            subject
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to fetch pending emails:', error)
        return NextResponse.json(
          { error: 'Failed to fetch pending emails', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json(data ?? [])
    } catch (error) {
      console.error('Pending emails error:', error)
      return NextResponse.json(
        { error: 'Internal error', details: String(error) },
        { status: 500 }
      )
    }
  }
)
