import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveRole } from '@/lib/auth/session'
import type { CookieOptions } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) {
    throw new Error('SITE_URL is not configured')
  }
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/auth/error?reason=no_code`)
  }

  const cookieStore = await cookies()

  // Build a response we can write refreshed cookies into. We also track
  // the options for each cookie so they can be re-applied on redirect
  // responses with their original attributes (httpOnly, secure, sameSite,
  // path, maxAge, etc.).
  const supabaseResponse = NextResponse.next()
  const cookieOptions = new Map<string, CookieOptions>()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    const reason =
      error?.code === 'pkce_code_verifier_not_found' ||
      error?.code === 'bad_code_verifier' ||
      error?.code === 'flow_state_expired' ||
      error?.code === 'flow_state_not_found'
        ? 'cross_device'
        : 'no_code'

    const redirectRes = NextResponse.redirect(
      `${siteUrl}/auth/error?reason=${reason}`,
    )
    supabaseResponse.cookies.getAll().forEach((c) =>
      redirectRes.cookies.set(
        c.name,
        c.value,
        cookieOptions.get(c.name) ?? {},
      ),
    )
    return redirectRes
  }

  const role = await resolveRole(data.session.user.id)

  let destination: string
  if (role === 'RETAILER') {
    destination = `${siteUrl}/retailer`
  } else if (role === 'ORDER_DESK') {
    destination = `${siteUrl}/order-desk`
  } else {
    destination = `${siteUrl}/auth/error?reason=not_registered`
  }

  const redirectRes = NextResponse.redirect(destination)
  supabaseResponse.cookies.getAll().forEach((c) =>
    redirectRes.cookies.set(
      c.name,
      c.value,
      cookieOptions.get(c.name) ?? {},
    ),
  )
  return redirectRes
}
