/**
 * POST /api/engagements/sync
 *
 * Parses an engagement `status.md` file and updates the matching row in
 * `kith_climate.engagements`. Frontmatter → structured columns, body →
 * `notes_markdown`.
 *
 * The `slug` from the request URL/body must match the frontmatter `slug`
 * (a safety check — we do not allow rewriting one engagement with another's
 * markdown).
 *
 * Body: { slug: string, markdown: string }
 *
 * Engagements has no RLS, so anon-key updates are permitted. The dashboard is
 * gated by Auth0, so this is acceptable for internal admin use.
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'
import {
  parseStatusMarkdown,
  fmString,
  fmStringArray,
  fmInt,
  fmDate,
} from '@/lib/engagement-frontmatter'

export const dynamic = 'force-dynamic'

const VALID_STREAMS = new Set(['corporate_contract', 'partner', 'coach'])
const VALID_STAGES = new Set([
  'intro',
  'discovery',
  'proposal_sent',
  'negotiation',
  'won',
  'live',
  'closed',
  'lost',
  'dormant',
])

export const POST = withLogging(
  { functionName: 'api/engagements/sync', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const { slug, markdown } = await request.json()

      if (!slug || typeof slug !== 'string') {
        return NextResponse.json({ error: 'slug is required' }, { status: 400 })
      }
      if (!markdown || typeof markdown !== 'string') {
        return NextResponse.json({ error: 'markdown is required' }, { status: 400 })
      }

      const { frontmatter, body } = parseStatusMarkdown(markdown)

      // Safety: slug in frontmatter must match the URL slug
      const fmSlug = fmString(frontmatter, 'slug')
      if (fmSlug && fmSlug !== slug) {
        return NextResponse.json(
          {
            error: `Slug mismatch: URL slug "${slug}" does not match frontmatter slug "${fmSlug}". Refusing to overwrite.`,
          },
          { status: 400 }
        )
      }

      // Required fields
      const organization_name = fmString(frontmatter, 'organization_name')
      const stream = fmString(frontmatter, 'stream')
      const stage = fmString(frontmatter, 'stage')

      if (!organization_name) {
        return NextResponse.json(
          { error: 'Frontmatter missing required field: organization_name' },
          { status: 400 }
        )
      }
      if (!stream || !VALID_STREAMS.has(stream)) {
        return NextResponse.json(
          {
            error: `Frontmatter "stream" must be one of: ${Array.from(VALID_STREAMS).join(', ')}`,
          },
          { status: 400 }
        )
      }
      if (!stage || !VALID_STAGES.has(stage)) {
        return NextResponse.json(
          {
            error: `Frontmatter "stage" must be one of: ${Array.from(VALID_STAGES).join(', ')}`,
          },
          { status: 400 }
        )
      }

      const update = {
        organization_name,
        stream,
        stage,
        primary_contact_name: fmString(frontmatter, 'primary_contact_name'),
        primary_contact_email: fmString(frontmatter, 'primary_contact_email'),
        primary_contact_role: fmString(frontmatter, 'primary_contact_role'),
        primary_contact_linkedin: fmString(frontmatter, 'primary_contact_linkedin'),
        region: fmString(frontmatter, 'region'),
        owner: fmString(frontmatter, 'owner'),
        source: fmString(frontmatter, 'source'),
        expected_value_cents: fmInt(frontmatter, 'expected_value_cents'),
        expected_close_date: fmDate(frontmatter, 'expected_close_date'),
        last_interaction_at: fmDate(frontmatter, 'last_interaction_at'),
        proposals: fmStringArray(frontmatter, 'proposals'),
        notes_markdown: body || null,
        last_synced_at: new Date().toISOString(),
      }

      const supabase = getSupabase()

      // Confirm the row exists before updating (so we return a clean 404 instead
      // of a silent no-op if the slug isn't in the DB yet).
      const { data: existing, error: fetchErr } = await supabase
        .from('engagements')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (fetchErr) {
        console.error('Engagement fetch error:', fetchErr)
        return NextResponse.json(
          { error: 'Failed to look up engagement', details: fetchErr.message },
          { status: 500 }
        )
      }
      if (!existing) {
        return NextResponse.json(
          {
            error: `No engagement found with slug "${slug}". Create the row first, then sync.`,
          },
          { status: 404 }
        )
      }

      const { data, error } = await supabase
        .from('engagements')
        .update(update)
        .eq('slug', slug)
        .select('slug, organization_name, stage, last_synced_at, updated_at')
        .single()

      if (error) {
        console.error('Engagement sync error:', error)
        return NextResponse.json(
          { error: 'Failed to sync engagement', details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        engagement: data,
        applied: {
          frontmatter_keys: Object.keys(frontmatter),
          body_chars: body.length,
        },
      })
    } catch (error) {
      console.error('Engagement sync error:', error)
      return NextResponse.json(
        { error: 'Failed to sync engagement', details: String(error) },
        { status: 500 }
      )
    }
  }
)
