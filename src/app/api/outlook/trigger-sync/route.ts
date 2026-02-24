/**
 * Trigger Outlook Sync
 *
 * Calls the Supabase `outlook-daily-sync` edge function on demand.
 * The edge function fetches sent emails from Microsoft Graph,
 * categorises them, and queues pending funnel changes.
 *
 * POST /api/outlook/trigger-sync
 * Body (optional): { days_back?: number }  — defaults to 7 for manual triggers
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const daysBack = body.days_back ?? 7

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/outlook-daily-sync?days_back=${daysBack}`

    const res = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('outlook-daily-sync edge function error:', data)
      return NextResponse.json(
        { error: 'Edge function failed', details: data },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('trigger-sync error:', error)
    return NextResponse.json(
      { error: 'Failed to trigger sync', details: String(error) },
      { status: 500 }
    )
  }
}
