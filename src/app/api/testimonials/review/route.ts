/**
 * POST /api/testimonials/review
 *
 * Thin proxy to the kith-climate-testimonial edge function for
 * approving or rejecting submitted testimonials.
 *
 * Body: { testimonial_id: string, status: "approved" | "rejected", reviewed_by?: string }
 */

import { NextResponse } from 'next/server'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const POST = withLogging(
  { functionName: 'api/testimonials/review', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const body = await request.json()
      const { testimonial_id, status, reviewed_by } = body

      if (!testimonial_id || !status) {
        return NextResponse.json(
          { error: 'testimonial_id and status are required' },
          { status: 400 }
        )
      }

      if (!['approved', 'rejected'].includes(status)) {
        return NextResponse.json(
          { error: 'status must be "approved" or "rejected"' },
          { status: 400 }
        )
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/kith-climate-testimonial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'review',
          testimonial_id,
          status,
          reviewed_by: reviewed_by || 'crm_admin',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('kith-climate-testimonial edge function error:', data)
        return NextResponse.json(
          { error: 'Edge function failed', details: data },
          { status: res.status }
        )
      }

      return NextResponse.json(data)
    } catch (error) {
      console.error('Testimonial review error:', error)
      return NextResponse.json(
        { error: 'Failed to review testimonial', details: String(error) },
        { status: 500 }
      )
    }
  }
)
