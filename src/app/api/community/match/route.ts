/**
 * POST /api/community/match
 *
 * Links a Discord member to an enrolled customer.
 * Updates both discord_members.customer_id and customers.discord_user_id + discord_status.
 *
 * Body: { discord_member_id: string, customer_id: string }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/community/match', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { discord_member_id, customer_id } = await request.json()

      if (!discord_member_id || !customer_id) {
        return NextResponse.json(
          { error: 'discord_member_id and customer_id are required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()
      const now = new Date().toISOString()

      // 1. Get the Discord member to retrieve their discord_user_id
      const { data: member, error: memberErr } = await supabase
        .from('discord_members')
        .select('discord_user_id')
        .eq('id', discord_member_id)
        .single()

      if (memberErr || !member) {
        return NextResponse.json(
          { error: 'Discord member not found' },
          { status: 404 }
        )
      }

      // 2. Update discord_members — link to customer
      const { error: dmErr } = await supabase
        .from('discord_members')
        .update({
          customer_id,
          matched_at: now,
          matched_by: 'dashboard_user',
          updated_at: now,
        })
        .eq('id', discord_member_id)

      if (dmErr) {
        return NextResponse.json(
          { error: 'Failed to update discord member', details: dmErr.message },
          { status: 500 }
        )
      }

      // 3. Update customer — set discord_user_id and status
      const { error: custErr } = await supabase
        .from('customers')
        .update({
          discord_user_id: member.discord_user_id,
          discord_status: 'joined',
          updated_at: now,
        })
        .eq('id', customer_id)

      if (custErr) {
        return NextResponse.json(
          { error: 'Failed to update customer', details: custErr.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Match error:', error)
      return NextResponse.json(
        { error: 'Match failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
