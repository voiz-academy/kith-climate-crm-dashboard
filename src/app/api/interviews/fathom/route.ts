/**
 * POST /api/interviews/fathom
 *
 * Upsert Fathom recording data onto an interview row.
 * If an interview already exists for the customer, updates it with
 * Fathom fields. Otherwise creates a minimal interview row with Fathom data.
 *
 * Body: {
 *   customer_id: string
 *   interviewee_email: string
 *   interviewee_name?: string
 *   fathom_recording_url: string
 *   fathom_summary?: string
 * }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      customer_id,
      interviewee_email,
      interviewee_name,
      fathom_recording_url,
      fathom_summary,
    } = body

    if (!customer_id || !interviewee_email || !fathom_recording_url) {
      return NextResponse.json(
        { error: 'customer_id, interviewee_email, and fathom_recording_url are required' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const normEmail = interviewee_email.toLowerCase().trim()

    // Try to extract recording ID from URL (e.g. fathom.video/share/xxxxx)
    let fathomRecordingId: number | null = null
    const idMatch = fathom_recording_url.match(/\/(\d+)(?:[/?#]|$)/)
    if (idMatch) {
      fathomRecordingId = parseInt(idMatch[1], 10)
    }

    // Look for existing interview for this customer
    const { data: existing } = await supabase
      .from('interviews')
      .select('id')
      .eq('customer_id', customer_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let interviewId: string
    let action: 'created' | 'updated'

    if (existing) {
      // Update existing interview with Fathom data
      const { error: updateErr } = await supabase
        .from('interviews')
        .update({
          fathom_recording_url,
          fathom_recording_id: fathomRecordingId,
          fathom_summary: fathom_summary || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (updateErr) {
        return NextResponse.json(
          { error: 'Failed to update interview', details: updateErr.message },
          { status: 500 }
        )
      }

      interviewId = existing.id
      action = 'updated'
    } else {
      // Create minimal interview row with Fathom data
      const { data: interview, error: insertErr } = await supabase
        .from('interviews')
        .insert({
          customer_id,
          interviewee_email: normEmail,
          interviewee_name: interviewee_name || null,
          fathom_recording_url,
          fathom_recording_id: fathomRecordingId,
          fathom_summary: fathom_summary || null,
          outcome: 'pending',
          activity_type: 'demo',
          cohort: 'March 16th 2026',
        })
        .select('id')
        .single()

      if (insertErr || !interview) {
        return NextResponse.json(
          { error: 'Failed to create interview', details: insertErr?.message },
          { status: 500 }
        )
      }

      interviewId = interview.id
      action = 'created'
    }

    return NextResponse.json({
      id: interviewId,
      action,
      customer_id,
    })
  } catch (error) {
    console.error('Fathom data upsert error:', error)
    return NextResponse.json(
      { error: 'Internal error', details: String(error) },
      { status: 500 }
    )
  }
}
