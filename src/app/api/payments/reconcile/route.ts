/**
 * POST /api/payments/reconcile
 *
 * Thin proxy to the reconcile-payment edge function.
 * Links an orphan payment to a CRM customer and advances them to enrolled.
 *
 * Body: { payment_id: string, customer_id: string, cohort?: string }
 */

import { NextResponse } from 'next/server'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const POST = withLogging(
  { functionName: 'api/payments/reconcile', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { payment_id, customer_id, cohort } = await request.json()

      if (!payment_id || !customer_id) {
        return NextResponse.json(
          { error: 'payment_id and customer_id are required' },
          { status: 400 }
        )
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ payment_id, customer_id, cohort }),
      })

      const data = await res.json()

      if (!res.ok && res.status !== 207) {
        console.error('reconcile-payment edge function error:', data)
        return NextResponse.json(
          { error: 'Reconcile failed', details: data },
          { status: res.status }
        )
      }

      return NextResponse.json(data, { status: res.status })
    } catch (error) {
      console.error('Reconcile payment error:', error)
      return NextResponse.json(
        { error: 'Reconcile failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
