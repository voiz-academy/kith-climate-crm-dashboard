/**
 * reconcile-payment
 *
 * Supabase Edge Function for linking an orphan (unmatched) Stripe payment
 * to a CRM customer and advancing them to enrolled.
 *
 * Called by the CRM dashboard via the /api/payments/reconcile proxy route.
 *
 * Orphan payments arise when the Stripe billing email differs from the CRM
 * contact email; the stripe-kith-climate-webhook records them with
 * reconciliation_status = 'unmatched_email'. This function attaches them
 * to the right customer, fires the funnel advancement (which queues the
 * enrollment confirmation email), and stamps an audit trail.
 *
 * POST { payment_id: string, customer_id: string, cohort?: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Default cohort for reconciled payments. Keep in sync with
// stripe-kith-climate-webhook::CURRENT_COHORT.
const CURRENT_COHORT = 'May 18th 2026'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'kith_climate' },
})

const log = (step: string, details?: Record<string, unknown>) => {
  const d = details ? ` — ${JSON.stringify(details)}` : ''
  console.log(`[reconcile-payment] ${step}${d}`)
}

const json = (obj: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

interface ReconcileRequest {
  payment_id: string
  customer_id: string
  cohort?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body: ReconcileRequest = await req.json()
    const { payment_id, customer_id, cohort: requestedCohort } = body

    if (!payment_id || !customer_id) {
      return json({ error: 'payment_id and customer_id are required' }, 400)
    }

    log('Reconcile request received', { payment_id, customer_id, requestedCohort })

    // 1. Load the payment and verify it's actually unmatched
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .select('id, reconciliation_status, customer_id, stripe_payment_intent_id, amount_cents, metadata')
      .eq('id', payment_id)
      .maybeSingle()

    if (pErr) {
      log('Payment lookup failed', { error: pErr.message })
      return json({ error: 'Payment lookup failed', details: pErr.message }, 500)
    }
    if (!payment) {
      return json({ error: 'Payment not found', payment_id }, 404)
    }
    if (payment.reconciliation_status !== 'unmatched_email') {
      return json({
        error: 'Payment is not in an unmatched state',
        current_status: payment.reconciliation_status,
        existing_customer_id: payment.customer_id,
      }, 409)
    }

    // 2. Load the target customer
    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, cohort_statuses')
      .eq('id', customer_id)
      .maybeSingle()

    if (cErr) {
      log('Customer lookup failed', { error: cErr.message })
      return json({ error: 'Customer lookup failed', details: cErr.message }, 500)
    }
    if (!customer) {
      return json({ error: 'Customer not found', customer_id }, 404)
    }

    // 3. Decide which cohort. Caller can override; otherwise default to CURRENT.
    const cohort = (requestedCohort || CURRENT_COHORT).trim()

    log('Reconciling payment', {
      payment_id,
      customer: { id: customer.id, name: `${customer.first_name} ${customer.last_name}`, email: customer.email },
      cohort,
    })

    // 4. Update the payment row: link the customer, assign cohort,
    //    flip reconciliation_status, append audit metadata.
    const reconciledAt = new Date().toISOString()
    const newMetadata = {
      ...(payment.metadata as Record<string, unknown> || {}),
      reconciled_at: reconciledAt,
      reconciled_to_customer_id: customer.id,
      reconciled_to_email: customer.email,
      reconciled_to_cohort: cohort,
      needs_reconciliation: false,
    }

    const { error: uErr } = await supabase
      .from('payments')
      .update({
        customer_id: customer.id,
        enrollee_customer_id: customer.id,
        cohort,
        reconciliation_status: 'reconciled_manually',
        metadata: newMetadata,
        updated_at: reconciledAt,
      })
      .eq('id', payment_id)

    if (uErr) {
      log('Payment update failed', { error: uErr.message })
      return json({ error: 'Payment update failed', details: uErr.message }, 500)
    }

    // 5. Advance the customer's funnel. This fires notify_email_on_funnel_change
    //    which queues the enrollment confirmation email automation. Same path
    //    a normal payment takes.
    const { error: fErr } = await supabase.rpc('advance_funnel', {
      p_customer_id: customer.id,
      p_new_status: 'enrolled',
      p_cohort: cohort,
    })

    if (fErr) {
      // Payment is reconciled but funnel didn't advance — log but don't roll back.
      log('Funnel advancement failed (payment still reconciled)', { error: fErr.message })
      return json({
        status: 'partial',
        payment_id,
        customer_id: customer.id,
        cohort,
        warning: 'Payment linked but funnel advancement failed — please advance manually',
        funnel_error: fErr.message,
      }, 207)
    }

    log('Reconciliation complete', { payment_id, customer_id: customer.id, cohort })

    return json({
      status: 'reconciled',
      payment_id,
      customer_id: customer.id,
      customer_email: customer.email,
      customer_name: `${customer.first_name} ${customer.last_name}`,
      cohort,
      amount_cents: payment.amount_cents,
    })
  } catch (err) {
    console.error('reconcile-payment error:', err)
    return json({ error: 'Reconciliation failed', details: String(err) }, 500)
  }
})
