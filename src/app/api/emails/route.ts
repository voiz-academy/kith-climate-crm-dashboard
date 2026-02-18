import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get('customer_id')
    if (!customerId) {
      return NextResponse.json({ error: 'customer_id required' }, { status: 400 })
    }

    const { data, error } = await getSupabase()
      .from('emails')
      .select('*')
      .eq('customer_id', customerId)
      .order('sent_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching emails:', error)
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }
}
