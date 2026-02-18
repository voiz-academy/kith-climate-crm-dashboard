import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { isEmailAllowed } from "@/lib/whitelist"

export async function middleware(request: NextRequest) {
  // Let Auth0 handle its own routes (/auth/login, /auth/callback, /auth/logout, etc.)
  const authResponse = await auth0.middleware(request)

  const { pathname } = request.nextUrl

  // For /auth/* paths, return the Auth0 response directly
  if (pathname.startsWith("/auth")) {
    return authResponse
  }

  // Allow the access-denied page to render without whitelist check
  if (pathname === "/access-denied") {
    // Still require Auth0 session so we can show who's logged in
    const session = await auth0.getSession(request)
    if (!session) {
      const loginUrl = new URL("/auth/login", request.url)
      loginUrl.searchParams.set("returnTo", pathname)
      return NextResponse.redirect(loginUrl)
    }
    return authResponse
  }

  // Webhook and API routes that use their own authentication (HMAC, etc.)
  // These must remain accessible without Auth0 session
  const publicPaths = [
    "/api/fathom/webhook",
    "/api/fathom/backfill",
    "/api/outlook/sync",
    "/api/debug",  // Temporary: remove after diagnosing data issue
  ]
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return authResponse
  }

  // For all other routes, require a valid Auth0 session
  const session = await auth0.getSession(request)
  if (!session) {
    const loginUrl = new URL("/auth/login", request.url)
    loginUrl.searchParams.set("returnTo", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check email whitelist — only allowed emails can access the CRM
  if (!isEmailAllowed(session.user?.email)) {
    return NextResponse.redirect(new URL("/access-denied", request.url))
  }

  return authResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets (images, svgs, pngs)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.svg$|.*\\.png$).*)",
  ],
}
