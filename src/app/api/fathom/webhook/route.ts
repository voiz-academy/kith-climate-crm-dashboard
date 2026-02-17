/**
 * Fathom Webhook Endpoint
 *
 * Receives `new_meeting_content_ready` events from Fathom when a recording
 * is processed. Fetches the full meeting data and upserts into interviews table.
 *
 * POST /api/fathom/webhook
 */

import { NextResponse } from 'next/server'
import {
  verifyWebhookSignature,
  fetchMeetingFromAnyAccount,
  extractInterviewData,
  findCustomerByEmail,
  upsertInterview,
} from '@/lib/fathom'
import { getSecrets } from '@/lib/secrets'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // 1. Read raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-fathom-signature') || ''

    // 2. Verify webhook signature (try all configured secrets from Supabase)
    const secretMap = await getSecrets(['FATHOM_WEBHOOK_SECRET', 'FATHOM_WEBHOOK_SECRET_DIEGO'])
    const secrets = Object.values(secretMap)

    if (secrets.length === 0) {
      console.error('No FATHOM_WEBHOOK_SECRET found in app_secrets')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    let isValid = false
    for (const secret of secrets) {
      if (await verifyWebhookSignature(rawBody, signature, secret)) {
        isValid = true
        break
      }
    }
    if (!isValid) {
      console.warn('Invalid Fathom webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // 3. Parse the webhook payload
    const payload = JSON.parse(rawBody)
    console.log('Fathom webhook received:', payload.event, 'recording_id:', payload.recording_id)

    // Only handle meeting content ready events
    if (payload.event !== 'new_meeting_content_ready') {
      return NextResponse.json({ status: 'ignored', reason: 'unhandled event type' })
    }

    const recordingId = payload.recording_id as number
    if (!recordingId) {
      return NextResponse.json({ error: 'Missing recording_id' }, { status: 400 })
    }

    // 4. Fetch full meeting data from Fathom API (tries all accounts)
    const meeting = await fetchMeetingFromAnyAccount(recordingId)
    const interviewData = extractInterviewData(meeting)

    // 5. Find or skip customer matching
    let customerId: string | null = null
    if (interviewData.interviewee_email) {
      customerId = await findCustomerByEmail(interviewData.interviewee_email)
    }

    // 6. Upsert interview record
    const result = await upsertInterview(interviewData, customerId)

    console.log(
      `Fathom webhook: ${result.action} interview ${result.id} for recording ${recordingId}`,
      interviewData.interviewee_name || 'unknown interviewee'
    )

    return NextResponse.json({
      status: 'ok',
      action: result.action,
      interview_id: result.id,
      interviewee: interviewData.interviewee_name,
      interviewer: interviewData.interviewer,
    })
  } catch (error) {
    console.error('Fathom webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
