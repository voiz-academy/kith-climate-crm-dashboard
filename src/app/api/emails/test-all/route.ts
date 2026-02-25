/**
 * POST /api/emails/test-all
 *
 * Sends all email templates to ben@kithailab.com with hardcoded test data.
 * Templates remain inactive — this bypasses automation and calls the edge function directly.
 * Used to verify the full email pipeline: edge function → Resend → delivery → email log.
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

const TEST_RECIPIENT = 'ben@kithailab.com'

// Hardcoded test data for all template variables
const TEST_DATA: Record<string, string> = {
  first_name: 'Ben',
  last_name: 'Hilton',
  email: 'ben@kithailab.com',
  company: 'Test Company Ltd',
  cohort: 'March 2026',
  enrollment_deadline: 'March 10, 2026',
  interviewer_name: 'Ben Hilton',
  interviewer_email: 'ben@kithailab.com',
  interviewer_title: 'Programme Director',
  interview_date: 'March 5, 2026 at 2:00 PM GMT',
  application_role: 'Sustainability Consultant',
  application_background: '10 years in environmental consulting and carbon accounting.',
  application_ai_view: 'AI can accelerate climate solutions by automating data analysis and risk modelling.',
  application_goals: 'Build AI-powered climate risk assessment tools for SMEs.',
  application_budget_confirmed: 'Yes',
  application_date: 'February 24, 2026',
  utm_source: 'linkedin',
  utm_medium: 'social',
  utm_campaign: 'cohort-march-2026',
  booking_status: 'Active',
  booking_status_color: '#22c55e',
  cancel_reason: '',
  calendly_event_uri: 'https://calendly.com/test-event',
  amount: '$2,500.00',
  payment_amount: '250000',
  payment_currency: 'USD',
  payment_status: 'succeeded',
  payment_product: 'Kith Climate Cohort',
  payment_cohort: 'March 2026',
  payment_date: 'February 24, 2026',
  stripe_payment_intent_id: 'pi_test_123456',
  stripe_customer_id: 'cus_test_123456',
  current_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  current_year: new Date().getFullYear().toString(),
}

function personalise(text: string): string {
  let out = text
  for (const [key, val] of Object.entries(TEST_DATA)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), val)
  }
  return out
}

export const POST = withLogging(
  { functionName: 'api/emails/test-all', httpMethod: 'POST' },
  async () => {
    try {
      const supabase = getSupabase()

      // Fetch all templates
      const { data: templates, error: tmplErr } = await supabase
        .from('email_templates')
        .select('id, name, subject, content, from_address, reply_to, cc_addresses')
        .order('name')

      if (tmplErr || !templates) {
        return NextResponse.json({ error: 'Failed to fetch templates', details: String(tmplErr) }, { status: 500 })
      }

      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/kith-climate-send-email`

      const results: Array<{ name: string; status: string; error?: string }> = []
      let sent = 0
      let failed = 0

      for (const tmpl of templates) {
        // Personalise subject and content with test data
        const subject = `[TEST] ${personalise(tmpl.subject)}`
        const html = personalise(tmpl.content)

        // Resolve from/reply_to (handles {interviewer_email} variable)
        const fromAddr = personalise(tmpl.from_address || 'ben@kithailab.com')
        const replyTo = tmpl.reply_to ? personalise(tmpl.reply_to) : undefined

        try {
          const resp = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
            },
            body: JSON.stringify({
              to: TEST_RECIPIENT,
              subject,
              html_body: html,
              from: fromAddr,
              reply_to: replyTo,
              cc: tmpl.cc_addresses && tmpl.cc_addresses.length > 0 ? tmpl.cc_addresses : undefined,
              email_type: `test_${tmpl.name}`,
              mode: 'immediate',
            }),
          })

          if (resp.ok) {
            results.push({ name: tmpl.name, status: 'sent' })
            sent++
          } else {
            const errBody = await resp.text()
            results.push({ name: tmpl.name, status: 'failed', error: errBody })
            failed++
          }
        } catch (err) {
          results.push({ name: tmpl.name, status: 'failed', error: String(err) })
          failed++
        }

        // Small delay between sends to avoid rate limiting
        await new Promise(r => setTimeout(r, 800))
      }

      return NextResponse.json({
        test_recipient: TEST_RECIPIENT,
        total: templates.length,
        sent,
        failed,
        results,
      })
    } catch (error) {
      console.error('Test all emails error:', error)
      return NextResponse.json(
        { error: 'Test failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
