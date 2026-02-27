/**
 * kith-climate-email-automation
 *
 * Supabase Edge Function called by database triggers when:
 *   1. customers.funnel_status changes (any status transition)
 *   2. A new cohort_applications row is inserted
 *
 * For each matching email_template (by funnel_trigger), respects is_active:
 *   - 'active'   -> send immediately via kith-climate-send-email
 *   - 'partial'  -> insert pending_emails row + notify ben@kithailab.com
 *   - 'inactive' -> skip
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

interface FunnelChangePayload {
  trigger_type: 'funnel_change'
  customer_id: string
  new_status: string
  old_status: string
}

interface ApplicationSubmittedPayload {
  trigger_type: 'application_submitted'
  application_id: string
  email: string
  name: string
  customer_id: string | null
  cohort: string | null
}

type Payload = FunnelChangePayload | ApplicationSubmittedPayload

interface Template {
  id: string
  name: string
  subject: string
  content: string
  is_active: 'active' | 'partial' | 'inactive'
  from_address: string | null
  reply_to: string | null
  cc_addresses: string[] | null
}

interface Customer {
  id: string
  email: string
  first_name: string
  last_name: string
  enrollment_deadline: string | null
}

// ── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: Payload = await req.json()
    console.log('Email automation triggered:', JSON.stringify(payload))

    if (payload.trigger_type === 'funnel_change') {
      await handleFunnelChange(payload)
    } else if (payload.trigger_type === 'application_submitted') {
      await handleApplicationSubmitted(payload)
    } else {
      console.error('Unknown trigger_type:', (payload as Record<string, unknown>).trigger_type)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Email automation error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── Funnel change handler ──────────────────────────────────────────────

async function handleFunnelChange(payload: FunnelChangePayload) {
  const { customer_id, new_status, old_status } = payload

  // Find templates matching this funnel trigger
  const { data: templates, error: tmplErr } = await supabase
    .from('email_templates')
    .select('id, name, subject, content, is_active, from_address, reply_to, cc_addresses')
    .eq('funnel_trigger', new_status)

  if (tmplErr) {
    console.error('Error fetching templates:', tmplErr)
    return
  }
  if (!templates || templates.length === 0) return

  // Fetch customer
  const customer = await getCustomer(customer_id)
  if (!customer) return

  for (const template of templates as Template[]) {
    await processTemplate(template, customer, new_status, old_status)
  }
}

// ── Application submitted handler ──────────────────────────────────────

async function handleApplicationSubmitted(payload: ApplicationSubmittedPayload) {
  const { customer_id, email, cohort } = payload

  // Resolve customer
  let customer: Customer | null = null

  if (customer_id) {
    customer = await getCustomer(customer_id)
  }

  if (!customer && email) {
    // Look up by email
    const { data, error } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, enrollment_deadline')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (error) {
      console.error('Error looking up customer by email:', error)
      return
    }
    customer = data
  }

  if (!customer) {
    console.warn(`No customer found for application (email: ${email}). Skipping automation.`)
    return
  }

  // Find templates with funnel_trigger = 'applied'
  const { data: templates, error: tmplErr } = await supabase
    .from('email_templates')
    .select('id, name, subject, content, is_active, from_address, reply_to, cc_addresses')
    .eq('funnel_trigger', 'applied')

  if (tmplErr) {
    console.error('Error fetching application templates:', tmplErr)
    return
  }
  if (!templates || templates.length === 0) return

  // Get current funnel status for context
  const old_status = 'registered' // applications come from registered state

  for (const template of templates as Template[]) {
    await processTemplate(template, customer, 'applied', old_status, cohort ?? undefined)
  }
}

// ── Shared logic ───────────────────────────────────────────────────────

async function getCustomer(customerId: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, enrollment_deadline')
    .eq('id', customerId)
    .single()

  if (error || !data) {
    console.error('Error fetching customer:', error)
    return null
  }
  return data
}

async function processTemplate(
  template: Template,
  customer: Customer,
  newStatus: string,
  oldStatus: string,
  cohort?: string,
) {
  if (template.is_active === 'inactive') return

  if (template.is_active === 'active') {
    // Send immediately
    await sendEmail(customer, template, newStatus, cohort)
  } else if (template.is_active === 'partial') {
    // Insert pending_emails row
    await createPendingEmail(customer, template, newStatus, oldStatus, cohort)
  }
}

async function sendEmail(
  customer: Customer,
  template: Template,
  triggerEvent: string,
  cohort?: string,
): Promise<boolean> {
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
        email_type: `automation_${triggerEvent}`,
        cohort: cohort || undefined,
        from: template.from_address || undefined,
        reply_to: template.reply_to || undefined,
        cc: template.cc_addresses && template.cc_addresses.length > 0
          ? template.cc_addresses
          : undefined,
        mode: 'template',
      }),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error(`Send failed for ${customer.email} (${template.name}):`, errBody)
      return false
    }

    console.log(`Sent ${template.name} to ${customer.email}`)
    return true
  } catch (err) {
    console.error(`Send error for ${customer.email} (${template.name}):`, err)
    return false
  }
}

async function createPendingEmail(
  customer: Customer,
  template: Template,
  newStatus: string,
  oldStatus: string,
  cohort?: string,
) {
  // Insert pending_emails row (same schema the dashboard modal expects)
  const { error: insertErr } = await supabase
    .from('pending_emails')
    .insert({
      customer_id: customer.id,
      template_id: template.id,
      trigger_event: newStatus,
      trigger_detail: {
        old_status: oldStatus,
        new_status: newStatus,
        cohort: cohort || null,
        customer_name: `${customer.first_name} ${customer.last_name}`,
        customer_email: customer.email,
        template_name: template.name,
        template_subject: template.subject,
      },
      status: 'pending',
    })

  if (insertErr) {
    console.error(`Error creating pending email for ${template.name}:`, insertErr)
    return
  }

  console.log(`Created pending email: ${template.name} for ${customer.email}`)

  // Send notification to ben@kithailab.com
  await sendApprovalNotification(customer, template, newStatus, oldStatus, cohort)
}

async function sendApprovalNotification(
  customer: Customer,
  template: Template,
  triggerEvent: string,
  oldStatus: string,
  cohort?: string,
) {
  const notificationHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Pending Email Approval</h2>
      <p>An automated email is waiting for your approval in the CRM.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Customer</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${customer.first_name} ${customer.last_name} (${customer.email})</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Template</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${template.name}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Subject</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${template.subject}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Trigger</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${oldStatus} → ${triggerEvent}${cohort ? ` [${cohort}]` : ''}</td></tr>
      </table>
      <p>Go to the <strong>Mailing</strong> page in the CRM to approve or reject this email.</p>
    </div>
  `.trim()

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/kith-climate-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        to: 'ben@kithailab.com',
        subject: `[Approval needed] ${template.name} → ${customer.first_name} ${customer.last_name}`,
        html_body: notificationHtml,
        from: 'contactus@kithclimate.com',
        email_type: 'automation_notification',
        mode: 'immediate',
      }),
    })
  } catch (err) {
    console.error('Notification email failed:', err)
  }
}
