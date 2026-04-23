/**
 * POST /api/certifications/create
 *
 * Thin proxy to the kith-climate-certificate edge function.
 * Creates a new certification record.
 *
 * Body: { first_name, last_name, email, cohort_id }
 *   cohort_id is the key into the COHORTS table defined inside the edge function
 *   (e.g. "8week-mar-2026", "6week-may-2026"). The edge function derives the
 *   program name, badge, topics, etc. from that config.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { first_name, last_name, email, cohort_id } = body

    if (!first_name || !last_name || !email) {
      return NextResponse.json(
        { error: 'first_name, last_name, and email are required' },
        { status: 400 }
      )
    }

    if (!cohort_id) {
      return NextResponse.json(
        { error: 'cohort_id is required' },
        { status: 400 }
      )
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/kith-climate-certificate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: 'create',
        first_name,
        last_name,
        email,
        cohort_id,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('kith-climate-certificate edge function error:', data)
      return NextResponse.json(
        { error: 'Edge function failed', details: data },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('create certification error:', error)
    return NextResponse.json(
      { error: 'Failed to create certification', details: String(error) },
      { status: 500 }
    )
  }
}
