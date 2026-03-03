/**
 * POST /api/pending-emails/reject
 *
 * Thin proxy to the kith-climate-pending-email-review edge function.
 * Rejects pending emails (does not send them).
 *
 * Body: { ids: string[] }
 */

import { NextResponse } from 'next/server'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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

      const res = await fetch(`${SUPABASE_URL}/functions/v1/kith-climate-pending-email-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: 'reject', ids }),
      })

      const data = await res.json()

      if (!res.ok && res.status !== 207) {
        console.error('pending-email-review edge function error:', data)
        return NextResponse.json(
          { error: 'Edge function failed', details: data },
          { status: res.status }
        )
      }

      return NextResponse.json(data, { status: res.status })
    } catch (error) {
      console.error('Reject pending emails error:', error)
      return NextResponse.json(
        { error: 'Rejection failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
