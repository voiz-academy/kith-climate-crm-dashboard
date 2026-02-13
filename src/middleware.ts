import { NextRequest, NextResponse } from 'next/server'

const ACCESS_KEY = 'kith2026'

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Don't protect login page, auth API, or static assets
  if (
    pathname === '/login' ||
    pathname === '/api/auth' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // Check for ?key= param — set cookie and continue (no redirect)
  const keyParam = searchParams.get('key')
  if (keyParam === ACCESS_KEY) {
    const response = NextResponse.next()
    response.cookies.set('kith-access', 'granted', {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
      path: '/',
    })
    return response
  }

  // Check for existing cookie
  const accessCookie = request.cookies.get('kith-access')
  if (accessCookie?.value === 'granted') {
    return NextResponse.next()
  }

  // Not authenticated — redirect to login
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.delete('key')
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
