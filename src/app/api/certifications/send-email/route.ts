/**
 * POST /api/certifications/send-email
 *
 * Thin proxy to the kith-climate-certificate edge function.
 * Sends a certification email for a given certification record.
 *
 * Body: { certification_id: string }
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { certification_id } = body

    if (!certification_id) {
      return NextResponse.json(
        { error: 'certification_id is required' },
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
      body: JSON.stringify({ action: 'send_email', certification_id }),
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
    console.error('send-email error:', error)
    return NextResponse.json(
      { error: 'Failed to send email', details: String(error) },
      { status: 500 }
    )
  }
}
