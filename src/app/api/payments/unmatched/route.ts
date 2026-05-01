/**
 * GET /api/payments/unmatched
 *
 * Returns Stripe payments that arrived without a matched CRM customer
 * (reconciliation_status = 'unmatched_email'). These need manual reconciliation
 * via the /reconcile dashboard page — typically caused by the Stripe billing
 * email differing from the customer's CRM contact email.
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, amount_cents, currency, paid_at, created_at, product, ' +
        'stripe_payment_intent_id, stripe_checkout_session_id, stripe_customer_id, ' +
        'metadata, reconciliation_status'
    )
    .eq('reconciliation_status', 'unmatched_email')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Unmatched payments fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch unmatched payments', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json(data || [])
}
