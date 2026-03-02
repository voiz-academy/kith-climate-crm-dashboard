import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { withLogging } from '@/lib/log-invocation'

export const dynamic = 'force-dynamic'

export const GET = withLogging(
  { functionName: 'api/enrichment/quality', httpMethod: 'GET' },
  async () => {
    try {
      const sb = getSupabase()

      const [
        // Match confidence (among enriched)
        confHigh,
        confMedium,
        confLow,
        confWrong,

        // Field completeness (among enriched)
        enrichedTotal,
        hasTitle,
        hasCompany,
        hasLocation,
        placeholderTitles,

        // Name status (all customers)
        fullName,
        firstOnly,
        noName,
      ] = await Promise.all([
        // Confidence
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched').eq('enrichment_match_confidence', 'high'),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched').eq('enrichment_match_confidence', 'medium'),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched').eq('enrichment_match_confidence', 'low'),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched').eq('enrichment_match_confidence', 'likely_wrong'),

        // Field completeness
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched'),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched')
          .not('linkedin_title', 'is', null).neq('linkedin_title', '').neq('linkedin_title', '--'),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched')
          .not('linkedin_company', 'is', null).neq('linkedin_company', ''),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched')
          .not('linkedin_location', 'is', null).neq('linkedin_location', ''),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched').eq('linkedin_title', '--'),

        // Name status
        sb.from('customers').select('*', { count: 'exact', head: true })
          .not('first_name', 'is', null).neq('first_name', '')
          .not('last_name', 'is', null).neq('last_name', ''),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .not('first_name', 'is', null).neq('first_name', '')
          .or('last_name.is.null,last_name.eq.'),
        sb.from('customers').select('*', { count: 'exact', head: true })
          .or('first_name.is.null,first_name.eq.'),
      ])

      return NextResponse.json({
        confidence: {
          high: confHigh.count ?? 0,
          medium: confMedium.count ?? 0,
          low: confLow.count ?? 0,
          likely_wrong: confWrong.count ?? 0,
        },
        fields: {
          enriched_total: enrichedTotal.count ?? 0,
          has_title: hasTitle.count ?? 0,
          has_company: hasCompany.count ?? 0,
          has_location: hasLocation.count ?? 0,
          placeholder_titles: placeholderTitles.count ?? 0,
        },
        names: {
          full_name: fullName.count ?? 0,
          first_only: firstOnly.count ?? 0,
          no_name: noName.count ?? 0,
        },
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
        }
      })
    } catch (error) {
      console.error('Error in /api/enrichment/quality:', error)
      return NextResponse.json(
        { error: 'Failed to fetch enrichment quality' },
        { status: 500 }
      )
    }
  }
)
