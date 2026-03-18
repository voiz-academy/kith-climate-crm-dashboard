/**
 * POST /api/community/sync-discord
 *
 * Thin proxy to the discord-member-sync Supabase Edge Function.
 * The edge function holds the Discord bot token and calls the Discord API
 * to upsert all guild members into kith_climate.discord_members.
 */

import { NextResponse } from 'next/server'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const POST = withLogging(
  { functionName: 'api/community/sync-discord', httpMethod: 'POST' },
  async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/discord-member-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('discord-member-sync edge function error:', data)
        return NextResponse.json(
          { error: 'Edge function failed', details: data },
          { status: res.status }
        )
      }

      return NextResponse.json(data)
    } catch (error) {
      console.error('Discord sync error:', error)
      return NextResponse.json(
        { error: 'Discord sync failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
