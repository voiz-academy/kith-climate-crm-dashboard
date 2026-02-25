/**
 * POST /api/emails/send
 *
 * Send emails to one or more customers using a template or custom HTML.
 *
 * Body:
 *   { customer_ids: string[], template_id?: string, custom_html?: string,
 *     custom_subject?: string, cohort?: string, from?: string, reply_to?: string }
 *
 * Either template_id or (custom_html + custom_subject) must be provided.
 * Invokes the kith-climate-send-email edge function for each recipient.
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/emails/send', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const body = await request.json()
      const {
        customer_ids,
        template_id,
        custom_html,
        custom_subject,
        cohort,
        from,
        reply_to,
      } = body as {
        customer_ids: string[]
        template_id?: string
        custom_html?: string
        custom_subject?: string
        cohort?: string
        from?: string
        reply_to?: string
      }

      if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
        return NextResponse.json(
          { error: 'customer_ids array is required' },
          { status: 400 }
        )
      }

      if (!template_id && (!custom_html || !custom_subject)) {
        return NextResponse.json(
          { error: 'Either template_id or (custom_html + custom_subject) is required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()

      // Fetch customers
      const { data: customers, error: custErr } = await supabase
        .from('customers')
        .select('id, email, first_name, last_name, linkedin_company, company_domain, enrollment_deadline, unsubscribed')
        .in('id', customer_ids)

      if (custErr) throw custErr
      if (!customers || customers.length === 0) {
        return NextResponse.json({ error: 'No customers found' }, { status: 404 })
      }

      // If using a template, fetch it (including routing fields)
      let template: { subject: string; content: string; id: string; from_address: string | null; reply_to: string | null; cc_addresses: string[] | null } | null = null
      if (template_id) {
        const { data: tmpl, error: tmplErr } = await supabase
          .from('email_templates')
          .select('id, subject, content, from_address, reply_to, cc_addresses')
          .eq('id', template_id)
          .single()

        if (tmplErr || !tmpl) {
          return NextResponse.json({ error: 'Template not found' }, { status: 404 })
        }
        template = tmpl
      }

      // Invoke the edge function for each customer
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/kith-climate-send-email`

      const results: Array<{ customer_id: string; email: string; status: string; error?: string }> = []
      let sent = 0
      let failed = 0
      let skipped = 0

      for (const customer of customers) {
        // Check unsubscribe status
        const unsub = customer.unsubscribed as string[] | null
        if (unsub && unsub.length > 0) {
          // Check if they're unsubscribed from the relevant category
          const emailCategory = template_id ? 'transactional' : 'marketing'
          if (unsub.includes(emailCategory) || unsub.includes('all')) {
            results.push({ customer_id: customer.id, email: customer.email, status: 'skipped_unsubscribed' })
            skipped++
            continue
          }
        }

        // Build CC list: caller override > template default
        const ccList = template?.cc_addresses && template.cc_addresses.length > 0
          ? template.cc_addresses
          : undefined

        const payload = template
          ? {
              to: customer.email,
              subject: template.subject,
              html_body: template.content,
              template_id: template.id,
              customer_id: customer.id,
              email_type: 'template_send',
              cohort: cohort || undefined,
              from: from || template.from_address || undefined,
              reply_to: reply_to || template.reply_to || undefined,
              cc: ccList,
              mode: 'template' as const,
            }
          : {
              to: customer.email,
              subject: custom_subject!,
              html_body: custom_html!,
              customer_id: customer.id,
              email_type: 'manual_send',
              cohort: cohort || undefined,
              from: from || undefined,
              reply_to: reply_to || undefined,
              mode: 'immediate' as const,
            }

        try {
          const resp = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
            },
            body: JSON.stringify(payload),
          })

          if (resp.ok) {
            results.push({ customer_id: customer.id, email: customer.email, status: 'sent' })
            sent++
          } else {
            const errBody = await resp.text()
            results.push({ customer_id: customer.id, email: customer.email, status: 'failed', error: errBody })
            failed++
          }
        } catch (err) {
          results.push({ customer_id: customer.id, email: customer.email, status: 'failed', error: String(err) })
          failed++
        }
      }

      return NextResponse.json({ sent, failed, skipped, total: customers.length, results })
    } catch (error) {
      console.error('Email send error:', error)
      return NextResponse.json(
        { error: 'Failed to send emails', details: String(error) },
        { status: 500 }
      )
    }
  }
)
