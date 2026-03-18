/**
 * POST /api/community/unmatch
 *
 * Removes the link between a Discord member and a customer.
 * Clears discord_members.customer_id and customers.discord_user_id + discord_status.
 *
 * Body: { discord_member_id: string }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const POST = withLogging(
  { functionName: 'api/community/unmatch', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { discord_member_id } = await request.json()

      if (!discord_member_id) {
        return NextResponse.json(
          { error: 'discord_member_id is required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()
      const now = new Date().toISOString()

      // 1. Get the current match to find the customer_id
      const { data: member, error: memberErr } = await supabase
        .from('discord_members')
        .select('customer_id')
        .eq('id', discord_member_id)
        .single()

      if (memberErr || !member) {
        return NextResponse.json(
          { error: 'Discord member not found' },
          { status: 404 }
        )
      }

      // 2. Clear the discord_members link
      const { error: dmErr } = await supabase
        .from('discord_members')
        .update({
          customer_id: null,
          matched_at: null,
          matched_by: null,
          updated_at: now,
        })
        .eq('id', discord_member_id)

      if (dmErr) {
        return NextResponse.json(
          { error: 'Failed to update discord member', details: dmErr.message },
          { status: 500 }
        )
      }

      // 3. Clear the customer's discord fields (if they were linked)
      if (member.customer_id) {
        const { error: custErr } = await supabase
          .from('customers')
          .update({
            discord_user_id: null,
            discord_status: 'not_invited',
            updated_at: now,
          })
          .eq('id', member.customer_id)

        if (custErr) {
          return NextResponse.json(
            { error: 'Failed to update customer', details: custErr.message },
            { status: 500 }
          )
        }
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Unmatch error:', error)
      return NextResponse.json(
        { error: 'Unmatch failed', details: String(error) },
        { status: 500 }
      )
    }
  }
)
