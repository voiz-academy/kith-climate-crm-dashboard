/**
 * kith-climate-pending-email-review
 *
 * Supabase Edge Function for approving or rejecting pending emails.
 * Called by the CRM dashboard via thin Next.js proxy routes.
 *
 * POST { action: 'approve' | 'reject', ids: string[] }
 *
 * - approve: personalises template, sends via kith-climate-send-email, marks approved
 * - reject: marks rejected (no email sent)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'kith_climate' },
})

// ── Types ──────────────────────────────────────────────────────────────

interface ReviewRequest {
  action: 'approve' | 'reject'
  ids: string[]
}

interface Result {
  id: string
  action: string
}

// ── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: ReviewRequest = await req.json()
    const { action, ids } = body

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return json({ error: 'action and ids[] are required' }, 400)
    }

    if (action !== 'approve' && action !== 'reject') {
      return json({ error: 'action must be "approve" or "reject"' }, 400)
    }

    const results: Result[] = []

    for (const id of ids) {
      if (action === 'reject') {
        const result = await rejectPendingEmail(id)
        results.push(result)
      } else {
        const result = await approvePendingEmail(id)
        results.push(result)
      }
    }

    const hasFailures = results.some(r => !r.action.startsWith('approved_and_sent') && r.action !== 'rejected')
    return json({ results }, hasFailures ? 207 : 200)
  } catch (err) {
    console.error('pending-email-review error:', err)
    return json({ error: String(err) }, 500)
  }
})

// ── Reject ─────────────────────────────────────────────────────────────

async function rejectPendingEmail(id: string): Promise<Result> {
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
    console.error(`Reject failed for ${id}:`, error)
    return { id, action: `error: ${error.message}` }
  }

  return { id, action: 'rejected' }
}

// ── Approve ────────────────────────────────────────────────────────────

async function approvePendingEmail(id: string): Promise<Result> {
  // 1. Fetch pending email
  const { data: pending, error: pendErr } = await supabase
    .from('pending_emails')
    .select('id, customer_id, template_id, trigger_event, trigger_detail')
    .eq('id', id)
    .eq('status', 'pending')
    .single()

  if (pendErr || !pending) {
    return { id, action: 'not_found_or_already_processed' }
  }

  // 2. Fetch template
  const { data: template, error: tmplErr } = await supabase
    .from('email_templates')
    .select('id, subject, content, from_address, reply_to, cc_addresses')
    .eq('id', pending.template_id)
    .single()

  if (tmplErr || !template) {
    return { id, action: `error: template not found (${pending.template_id})` }
  }

  // 3. Fetch customer
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, linkedin_company, company_domain, enrollment_deadline')
    .eq('id', pending.customer_id)
    .single()

  if (custErr || !customer) {
    return { id, action: `error: customer not found (${pending.customer_id})` }
  }

  // 4. Send via kith-climate-send-email edge function
  const detail = pending.trigger_detail as Record<string, unknown> | null
  const cohort = detail?.cohort as string | undefined

  const ccList = template.cc_addresses && template.cc_addresses.length > 0
    ? template.cc_addresses
    : undefined

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/kith-climate-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        to: customer.email,
        subject: template.subject,
        html_body: template.content,
        template_id: template.id,
        customer_id: customer.id,
        email_type: `automation_${pending.trigger_event}`,
        cohort: cohort || undefined,
        from: template.from_address || undefined,
        reply_to: template.reply_to || undefined,
        cc: ccList,
        mode: 'template',
      }),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error(`Send failed for ${customer.email}:`, errBody)
      return { id, action: `send_failed: ${errBody}` }
    }

    const sendResult = await resp.json()
    if (sendResult.failed > 0) {
      console.error(`Resend reported failures:`, sendResult.errors)
      return { id, action: `send_failed: ${sendResult.errors?.join(', ')}` }
    }
  } catch (err) {
    console.error(`Send error for ${customer.email}:`, err)
    return { id, action: `send_failed: ${String(err)}` }
  }

  // 5. Mark as approved
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
    console.error(`Approve update failed for ${id}:`, updateErr)
    return { id, action: `approved_but_update_failed: ${updateErr.message}` }
  }

  console.log(`Approved and sent: ${template.subject} → ${customer.email}`)
  return { id, action: 'approved_and_sent' }
}

// ── Helpers ────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
