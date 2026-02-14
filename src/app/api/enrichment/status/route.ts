import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const statuses = ['pending', 'enriching', 'enriched', 'failed', 'skipped'] as const

    const counts: Record<string, number> = {}
    for (const status of statuses) {
      const { count, error } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('enrichment_status', status)

      if (error) throw error
      counts[status] = count ?? 0
    }

    return NextResponse.json(counts, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
      }
    })
  } catch (error) {
    console.error('Error in /api/enrichment/status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch enrichment status' },
      { status: 500 }
    )
  }
}
