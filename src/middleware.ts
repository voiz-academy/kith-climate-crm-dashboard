import { NextRequest, NextResponse } from 'next/server'

const ACCESS_KEY = 'kith2026'

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Don't protect the login page or static assets
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Check for ?key= param — set cookie and redirect to clean URL
  const keyParam = searchParams.get('key')
  if (keyParam === ACCESS_KEY) {
    const url = request.nextUrl.clone()
    url.searchParams.delete('key')
    const response = NextResponse.redirect(url)
    response.cookies.set('kith-access', 'granted', {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
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
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
