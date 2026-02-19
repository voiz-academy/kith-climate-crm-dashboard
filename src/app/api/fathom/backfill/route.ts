/**
 * Fathom Backfill Endpoint
 *
 * Fetches all meetings from Fathom for Ben Hillier and:
 * 1. Matches existing interviews by fathom_recording_url (share_url)
 * 2. Updates matched rows with transcript + summary + recording_id
 * 3. Creates new interview rows for unmatched meetings (if customer found)
 *
 * POST /api/fathom/backfill
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  fetchAllMeetingsFromAllAccounts,
  extractInterviewData,
  findCustomerByEmail,
  upsertInterview,
  type FathomMeeting,
} from '@/lib/fathom'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/fathom/backfill', httpMethod: 'POST' },
  async () => {
    try {
      // 1. Fetch all existing interviews to match against
      const { data: existingInterviews, error: fetchError } = await supabase
        .from('interviews')
        .select('id, fathom_recording_url, fathom_recording_id, interviewee_email')

      if (fetchError) throw fetchError

      // Build lookup maps
      const urlToInterviewId = new Map<string, string>()
      const recordingIdSet = new Set<number>()

      existingInterviews?.forEach(interview => {
        if (interview.fathom_recording_url) {
          urlToInterviewId.set(interview.fathom_recording_url, interview.id)
        }
        if (interview.fathom_recording_id) {
          recordingIdSet.add(interview.fathom_recording_id)
        }
      })

      // 2. Fetch all meetings from all Fathom accounts (Ben + Diego)
      console.log('Backfill: Fetching meetings from all Fathom accounts...')
      const meetings = await fetchAllMeetingsFromAllAccounts({
        includeTranscript: true,
        includeSummary: true,
      })
      console.log(`Backfill: Found ${meetings.length} total meetings across all accounts`)

      // 3. Process each meeting
      const results = {
        total: meetings.length,
        matched_by_url: 0,
        matched_by_recording_id: 0,
        created_new: 0,
        skipped_no_customer: 0,
        skipped_already_processed: 0,
        errors: [] as string[],
      }

      for (const meeting of meetings) {
        try {
          const interviewData = extractInterviewData(meeting)

          // Skip if already processed by recording_id
          if (recordingIdSet.has(meeting.recording_id)) {
            // Still update transcript/summary if missing
            await updateExistingByRecordingId(meeting)
            results.matched_by_recording_id++
            continue
          }

          // Try to match by share_url against existing fathom_recording_url
          const matchedId = urlToInterviewId.get(meeting.share_url)
          if (matchedId) {
            await updateExistingInterview(matchedId, meeting)
            results.matched_by_url++
            recordingIdSet.add(meeting.recording_id) // Prevent double processing
            continue
          }

          // No existing match — try to find customer and create new row
          let customerId: string | null = null
          if (interviewData.interviewee_email) {
            customerId = await findCustomerByEmail(interviewData.interviewee_email)
          }

          if (!customerId && !interviewData.interviewee_email) {
            results.skipped_no_customer++
            continue
          }

          const result = await upsertInterview(interviewData, customerId)
          if (result.action === 'created') {
            results.created_new++
          }
          recordingIdSet.add(meeting.recording_id)
        } catch (err) {
          results.errors.push(`Recording ${meeting.recording_id}: ${String(err)}`)
        }
      }

      console.log('Backfill complete:', results)
      return NextResponse.json(results)
    } catch (error) {
      console.error('Fathom backfill error:', error)
      return NextResponse.json(
        { error: 'Backfill failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)

/**
 * Update an existing interview row matched by fathom_recording_url.
 */
async function updateExistingInterview(interviewId: string, meeting: FathomMeeting) {
  const interviewData = extractInterviewData(meeting)

  const updateFields: Record<string, unknown> = {
    fathom_recording_id: interviewData.fathom_recording_id,
    updated_at: new Date().toISOString(),
  }

  // Only update fields that are currently NULL (don't overwrite existing data)
  if (interviewData.transcript) updateFields.transcript = interviewData.transcript
  if (interviewData.fathom_summary) updateFields.fathom_summary = interviewData.fathom_summary
  if (interviewData.interviewee_name) updateFields.interviewee_name = interviewData.interviewee_name
  if (interviewData.interviewee_email) updateFields.interviewee_email = interviewData.interviewee_email

  const { error } = await supabase
    .from('interviews')
    .update(updateFields)
    .eq('id', interviewId)

  if (error) throw new Error(`Failed to update interview ${interviewId}: ${error.message}`)
}

/**
 * Update an existing interview row matched by fathom_recording_id.
 * Only fills in NULL fields (transcript, summary).
 */
async function updateExistingByRecordingId(meeting: FathomMeeting) {
  const interviewData = extractInterviewData(meeting)

  // Check what's currently NULL
  const { data: current } = await supabase
    .from('interviews')
    .select('transcript, fathom_summary')
    .eq('fathom_recording_id', meeting.recording_id)
    .single()

  if (!current) return

  const updateFields: Record<string, unknown> = {}
  if (!current.transcript && interviewData.transcript) {
    updateFields.transcript = interviewData.transcript
  }
  if (!current.fathom_summary && interviewData.fathom_summary) {
    updateFields.fathom_summary = interviewData.fathom_summary
  }

  if (Object.keys(updateFields).length === 0) return // Nothing to update

  updateFields.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('interviews')
    .update(updateFields)
    .eq('fathom_recording_id', meeting.recording_id)

  if (error) throw new Error(`Failed to update by recording_id ${meeting.recording_id}: ${error.message}`)
}
