import { NextRequest, NextResponse } from 'next/server'

const ACCESS_KEY = 'kith2026'

export async function POST(request: NextRequest) {
  const { key } = await request.json()

  if (key === ACCESS_KEY) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('kith-access', 'granted', {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
    })
    return response
  }

  return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
}
