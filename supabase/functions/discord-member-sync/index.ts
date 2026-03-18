/**
 * discord-member-sync
 *
 * Supabase Edge Function that fetches all members from a Discord guild
 * and upserts them into kith_climate.discord_members.
 *
 * Handles pagination (Discord returns max 1000 per request).
 * Backloads historical members via joined_at timestamp.
 *
 * POST {} (no body required)
 *
 * Secrets: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!
const DISCORD_GUILD_ID = Deno.env.get('DISCORD_GUILD_ID')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'kith_climate' },
})

// ── Types ──────────────────────────────────────────────────────────────

interface DiscordUser {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
  bot?: boolean
}

interface DiscordGuildMember {
  user: DiscordUser
  nick: string | null
  joined_at: string
  roles: string[]
}

// ── Discord API ────────────────────────────────────────────────────────

function getAvatarUrl(userId: string, avatarHash: string | null): string | null {
  if (!avatarHash) return null
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`
}

async function fetchAllGuildMembers(): Promise<DiscordGuildMember[]> {
  const allMembers: DiscordGuildMember[] = []
  let after = '0'

  while (true) {
    const url = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members?limit=1000&after=${after}`
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Discord API error ${res.status}: ${body}`)
    }

    const members: DiscordGuildMember[] = await res.json()
    if (members.length === 0) break

    allMembers.push(...members)
    after = members[members.length - 1].user.id

    if (members.length < 1000) break
  }

  return allMembers
}

// ── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      return json({ error: 'DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be set' }, 500)
    }

    // 1. Fetch all guild members from Discord
    const members = await fetchAllGuildMembers()

    // Filter out bots
    const humanMembers = members.filter(m => m.user && !m.user.bot)

    const now = new Date().toISOString()
    let inserted = 0
    let updated = 0
    let skipped = 0

    for (const member of humanMembers) {
      const discordUserId = member.user.id
      const displayName = member.nick || member.user.global_name || null

      // Check if already exists
      const { data: existing } = await supabase
        .from('discord_members')
        .select('id, discord_username, discord_display_name, roles')
        .eq('discord_user_id', discordUserId)
        .limit(1)
        .single()

      if (existing) {
        // Update if username, display name, or roles changed
        const rolesChanged = JSON.stringify((existing.roles || []).sort()) !== JSON.stringify((member.roles || []).sort())
        const nameChanged = existing.discord_username !== member.user.username ||
          existing.discord_display_name !== displayName

        if (nameChanged || rolesChanged) {
          await supabase
            .from('discord_members')
            .update({
              discord_username: member.user.username,
              discord_display_name: displayName,
              discord_avatar_url: getAvatarUrl(member.user.id, member.user.avatar),
              roles: member.roles || [],
              updated_at: now,
            })
            .eq('id', existing.id)
          updated++
        } else {
          skipped++
        }
      } else {
        // Insert new member
        const { error: insertErr } = await supabase
          .from('discord_members')
          .insert({
            discord_user_id: discordUserId,
            discord_username: member.user.username,
            discord_display_name: displayName,
            discord_avatar_url: getAvatarUrl(member.user.id, member.user.avatar),
            joined_server_at: member.joined_at,
            roles: member.roles || [],
            created_at: now,
            updated_at: now,
          })

        if (insertErr) {
          console.error(`Failed to insert ${member.user.username}:`, insertErr.message)
          skipped++
        } else {
          inserted++
        }
      }
    }

    console.log(`Discord sync complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped`)

    return json({
      success: true,
      total_discord_members: humanMembers.length,
      inserted,
      updated,
      skipped,
    })
  } catch (err) {
    console.error('discord-member-sync error:', err)
    return json({ error: String(err) }, 500)
  }
})

// ── Helpers ────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
