/**
 * GET /api/customers/search?q=<query>
 *
 * Searches customers by name or email for typeahead/autocomplete.
 * Returns up to 10 matching customers with basic profile info.
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json([])
  }

  const supabase = getSupabase()

  // Search by first_name, last_name, or email using ilike
  const searchPattern = `%${q}%`

  const { data, error } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, funnel_status, linkedin_company, linkedin_title')
    .or(`email.ilike.${searchPattern},first_name.ilike.${searchPattern},last_name.ilike.${searchPattern}`)
    .order('last_name', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Customer search error:', error)
    return NextResponse.json(
      { error: 'Search failed', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json(data || [])
}
