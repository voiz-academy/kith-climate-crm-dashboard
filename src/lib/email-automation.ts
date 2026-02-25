/**
 * Email automation logic for funnel status changes.
 *
 * When a customer's funnel status changes, this module checks email_templates
 * for matching funnel_trigger values and acts based on the template's is_active setting:
 *   - 'active'   → send immediately via edge function
 *   - 'partial'  → insert pending_emails row + notify ben@kithailab.com
 *   - 'inactive' → skip
 */

import { getSupabase } from '@/lib/supabase'

interface TriggerParams {
  customer_id: string
  new_status: string
  old_status: string
  cohort?: string
}

/**
 * Trigger email automations for a funnel status change.
 * Called from the pending-changes approve route.
 */
export async function triggerEmailAutomation({
  customer_id,
  new_status,
  old_status,
  cohort,
}: TriggerParams): Promise<void> {
  const supabase = getSupabase()

  // Find templates matching this funnel trigger
  const { data: templates, error: tmplErr } = await supabase
    .from('email_templates')
    .select('id, name, subject, content, is_active, from_address, reply_to, cc_addresses, funnel_trigger')
    .eq('funnel_trigger', new_status)

  if (tmplErr) {
    console.error('Error fetching templates for trigger:', tmplErr)
    return
  }

  if (!templates || templates.length === 0) return

  // Fetch the customer
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, enrollment_deadline, unsubscribed')
    .eq('id', customer_id)
    .single()

  if (custErr || !customer) {
    console.error('Error fetching customer for automation:', custErr)
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  for (const template of templates) {
    if (template.is_active === 'inactive') continue

    if (template.is_active === 'active') {
      // Send immediately
      await sendEmail({
        supabaseUrl,
        supabaseKey,
        customer,
        template,
        cohort,
        triggerEvent: new_status,
      })
    } else if (template.is_active === 'partial') {
      // Insert pending record
      const { error: insertErr } = await supabase
        .from('pending_emails')
        .insert({
          customer_id: customer.id,
          template_id: template.id,
          trigger_event: new_status,
          trigger_detail: {
            old_status,
            new_status,
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
        continue
      }

      // Send notification to ben@kithailab.com
      await sendNotificationEmail({
        supabaseUrl,
        supabaseKey,
        customer,
        template,
        triggerEvent: new_status,
        oldStatus: old_status,
        cohort,
      })
    }
  }
}

/**
 * Send an email via the kith-climate-send-email edge function.
 */
async function sendEmail({
  supabaseUrl,
  supabaseKey,
  customer,
  template,
  cohort,
  triggerEvent,
}: {
  supabaseUrl: string
  supabaseKey: string
  customer: { id: string; email: string; first_name: string; last_name: string }
  template: { id: string; name?: string; subject: string; content: string; from_address: string | null; reply_to: string | null; cc_addresses: string[] | null }
  cohort?: string
  triggerEvent: string
}): Promise<boolean> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/kith-climate-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
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
        cc: template.cc_addresses && template.cc_addresses.length > 0 ? template.cc_addresses : undefined,
        mode: 'template',
      }),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error(`Automation send failed for ${customer.email} (${template.name ?? template.id}):`, errBody)
      return false
    }
    return true
  } catch (err) {
    console.error(`Automation send error for ${customer.email} (${template.name ?? template.id}):`, err)
    return false
  }
}

/**
 * Send a notification email to ben@kithailab.com about a pending automation.
 */
async function sendNotificationEmail({
  supabaseUrl,
  supabaseKey,
  customer,
  template,
  triggerEvent,
  oldStatus,
  cohort,
}: {
  supabaseUrl: string
  supabaseKey: string
  customer: { id: string; email: string; first_name: string; last_name: string }
  template: { name: string; subject: string }
  triggerEvent: string
  oldStatus: string
  cohort?: string
}): Promise<void> {
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
    await fetch(`${supabaseUrl}/functions/v1/kith-climate-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
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

/**
 * Send a previously pending email (called from the approve route).
 */
export async function sendPendingEmail(pendingEmailId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()

  // Fetch the pending email with template and customer
  const { data: pending, error: pendErr } = await supabase
    .from('pending_emails')
    .select('id, customer_id, template_id, trigger_event, trigger_detail')
    .eq('id', pendingEmailId)
    .single()

  if (pendErr || !pending) {
    return { success: false, error: 'Pending email not found' }
  }

  const { data: template, error: tmplErr } = await supabase
    .from('email_templates')
    .select('id, subject, content, from_address, reply_to, cc_addresses')
    .eq('id', pending.template_id)
    .single()

  if (tmplErr || !template) {
    return { success: false, error: 'Template not found' }
  }

  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name')
    .eq('id', pending.customer_id)
    .single()

  if (custErr || !customer) {
    return { success: false, error: 'Customer not found' }
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  const detail = pending.trigger_detail as Record<string, unknown> | null
  const cohort = detail?.cohort as string | undefined

  const sent = await sendEmail({
    supabaseUrl,
    supabaseKey,
    customer,
    template,
    cohort,
    triggerEvent: pending.trigger_event,
  })

  if (!sent) {
    return { success: false, error: 'Edge function send failed' }
  }

  return { success: true }
}
