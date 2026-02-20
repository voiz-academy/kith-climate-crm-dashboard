/**
 * GET /api/interviews/check?email=...&date=YYYY-MM-DD
 *
 * Checks if an existing interview row exists for the given email + date.
 * Used by the AddInterviewModal to detect Fathom-created rows before
 * the interviewer submits, so they know they're updating (not creating).
 *
 * Returns:
 *   { found: false }
 *   { found: true, id, has_fathom_data, has_transcript, interviewer, outcome, conducted_at }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const date = searchParams.get('date')

  if (!email || !date) {
    return NextResponse.json(
      { error: 'email and date query params required' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()
  const normEmail = email.toLowerCase().trim()

  // Build same-day range in UTC
  const d = new Date(date + 'T00:00:00Z')
  if (isNaN(d.getTime())) {
    return NextResponse.json(
      { error: 'Invalid date format. Use YYYY-MM-DD.' },
      { status: 400 }
    )
  }

  const dayStart = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0
  ))
  const dayEnd = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999
  ))

  const { data: rows } = await supabase
    .from('interviews')
    .select('id, fathom_recording_id, fathom_recording_url, transcript, interviewer, outcome, conducted_at')
    .eq('interviewee_email', normEmail)
    .gte('conducted_at', dayStart.toISOString())
    .lte('conducted_at', dayEnd.toISOString())
    .order('fathom_recording_id', { ascending: false, nullsFirst: false })
    .limit(5)

  // Prefer the row with Fathom data
  const match = rows?.find(r => r.fathom_recording_id != null)
    ?? rows?.[0]
    ?? null

  if (!match) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({
    found: true,
    id: match.id,
    has_fathom_data: match.fathom_recording_id != null,
    has_transcript: !!match.transcript,
    fathom_url: match.fathom_recording_url || null,
    interviewer: match.interviewer,
    outcome: match.outcome,
    conducted_at: match.conducted_at,
  })
}
