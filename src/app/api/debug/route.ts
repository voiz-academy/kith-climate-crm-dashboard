import { NextResponse } from 'next/server'
import { supabase, fetchAll, Customer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const diagnostics: Record<string, unknown> = {}

  // 1. Check env vars
  diagnostics.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(not set)'
  diagnostics.anonKeyPresent = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  diagnostics.anonKeyLength = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length ?? 0

  // 2. Try a raw Supabase query
  try {
    const { data, error, count } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })

    diagnostics.rawQuery = {
      error: error ? { message: error.message, code: error.code, details: error.details } : null,
      count,
      dataIsNull: data === null,
    }
  } catch (e) {
    diagnostics.rawQuery = { exception: String(e) }
  }

  // 3. Try fetchAll (the function pages use)
  try {
    const customers = await fetchAll<Customer>('customers')
    diagnostics.fetchAll = {
      count: customers.length,
      firstEmail: customers[0]?.email ?? '(none)',
    }
  } catch (e) {
    diagnostics.fetchAll = { exception: String(e) }
  }

  return NextResponse.json(diagnostics, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
