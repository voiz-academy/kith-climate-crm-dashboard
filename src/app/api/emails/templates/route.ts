/**
 * GET /api/emails/templates — List all email templates
 * POST /api/emails/templates — Create or update an email template
 * PATCH /api/emails/templates — Update is_active status for a template
 *
 * GET params: ?type=transactional|marketing (optional filter)
 * POST body: { id?, name, subject, preview_text?, content, template_type, funnel_trigger?, is_active? }
 * PATCH body: { id, is_active }
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const GET = withLogging(
  { functionName: 'api/emails/templates', httpMethod: 'GET' },
  async (request: Request) => {
    try {
      const url = new URL(request.url)
      const typeFilter = url.searchParams.get('type')

      let query = getSupabase()
        .from('email_templates')
        .select('*')
        .order('name', { ascending: true })

      if (typeFilter) {
        query = query.eq('template_type', typeFilter)
      }

      const { data, error } = await query

      if (error) throw error

      return NextResponse.json(data || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
    }
  }
)

export const POST = withLogging(
  { functionName: 'api/emails/templates', httpMethod: 'POST' },
  async (request: Request) => {
    try {
      const body = await request.json()
      const { id, name, subject, preview_text, content, template_type, funnel_trigger, is_active } = body as {
        id?: string
        name: string
        subject: string
        preview_text?: string
        content: string
        template_type: string
        funnel_trigger?: string
        is_active?: 'active' | 'partial' | 'inactive'
      }

      if (!name || !subject || !content) {
        return NextResponse.json(
          { error: 'name, subject, and content are required' },
          { status: 400 }
        )
      }

      const supabase = getSupabase()
      const now = new Date().toISOString()

      if (id) {
        // Update existing template
        const updateData: Record<string, unknown> = {
            name,
            subject,
            preview_text: preview_text || null,
            content,
            template_type: template_type || 'transactional',
            funnel_trigger: funnel_trigger || null,
            updated_at: now,
          }
        if (is_active) updateData.is_active = is_active

        const { data, error } = await supabase
          .from('email_templates')
          .update(updateData)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error
        return NextResponse.json(data)
      } else {
        // Create new template
        const insertData: Record<string, unknown> = {
            name,
            subject,
            preview_text: preview_text || null,
            content,
            template_type: template_type || 'transactional',
            funnel_trigger: funnel_trigger || null,
            created_at: now,
            updated_at: now,
          }
        if (is_active) insertData.is_active = is_active

        const { data, error } = await supabase
          .from('email_templates')
          .insert(insertData)
          .select()
          .single()

        if (error) throw error
        return NextResponse.json(data, { status: 201 })
      }
    } catch (error) {
      console.error('Error saving template:', error)
      return NextResponse.json(
        { error: 'Failed to save template', details: String(error) },
        { status: 500 }
      )
    }
  }
)

export const PATCH = withLogging(
  { functionName: 'api/emails/templates', httpMethod: 'PATCH' },
  async (request: Request) => {
    try {
      const { id, is_active } = await request.json() as {
        id: string
        is_active: 'active' | 'partial' | 'inactive'
      }

      if (!id || !is_active || !['active', 'partial', 'inactive'].includes(is_active)) {
        return NextResponse.json(
          { error: 'id and valid is_active value required' },
          { status: 400 }
        )
      }

      const { data, error } = await getSupabase()
        .from('email_templates')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json(data)
    } catch (error) {
      console.error('Error updating template status:', error)
      return NextResponse.json(
        { error: 'Failed to update status', details: String(error) },
        { status: 500 }
      )
    }
  }
)
