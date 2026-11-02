import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { resolveRole } from '@/lib/auth/session'

const PROTECTED_PREFIXES = ['/retailer', '/order-desk']

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  // Initialise a pass-through response so the Supabase client has a place to
  // write refreshed auth cookies via setAll. We also track cookie options so
  // they can be re-applied on redirect responses with their original attributes.
  const supabaseResponse = NextResponse.next({ request })
  const cookieOptions = new Map<string, CookieOptions>()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
            cookieOptions.set(name, options)
          })
          Object.entries(headers).forEach(([k, v]) =>
            supabaseResponse.headers.set(k, v),
          )
        },
      },
    },
  )

  // Verify the session server-side and refresh the access token if stale.
  // NEVER use getSession() here — it trusts the unverified client JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  /**
   * Build a redirect response that carries any freshly-written session cookies.
   * Without this copy, refreshed tokens are discarded and the user is silently
   * logged out on the next request.
   */
  function redirectWithCookies(destination: URL) {
    const res = NextResponse.redirect(destination)
    supabaseResponse.cookies.getAll().forEach((c) =>
      res.cookies.set(
        c.name,
        c.value,
        cookieOptions.get(c.name) ?? {},
      ),
    )
    return res
  }

  if (!user && isProtectedPath(pathname)) {
    return redirectWithCookies(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    const role = await resolveRole(user.id)
    if (role === 'RETAILER') {
      return redirectWithCookies(new URL('/retailer', request.url))
    }
    if (role === 'ORDER_DESK') {
      return redirectWithCookies(new URL('/order-desk', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  // Exclude static assets, image optimization, API routes, and public files
  // so the auth check does not run for requests that do not need it.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|public).*)'],
}
