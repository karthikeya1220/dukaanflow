import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

/**
 * Creates a Supabase server client for the current request.
 *
 * This factory is used from Server Components (read-only auth checks) and
 * Server Actions (sendMagicLink, signOut). In Server Component contexts,
 * Next.js does not permit cookie mutation — attempting it throws. We catch
 * that specific failure so the client can still be used for read-only lookups.
 *
 * Response headers are written to the response object in Route Handlers and
 * the Proxy, which use their own dedicated clients. They are not handled here.
 */
function isCookieMutationError(err: unknown): err is Error {
  return (
    err instanceof Error &&
    // Next.js throws when cookies are mutated outside a Route Handler or
    // Server Action (e.g. from a Server Component).
    (err.message.includes('cookie') ||
      err.message.includes('cookies'))
  )
}
export async function createClient() {
  await connection()
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet, headers) {
          // This factory does not propagate response headers — the Route Handler
          // (src/app/auth/callback/route.ts) and Proxy (src/proxy.ts) use their
          // own dedicated Supabase clients that handle header propagation.
          void headers
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch (err) {
            if (isCookieMutationError(err)) return
            throw err
          }
        },
      },
    },
  )
}
