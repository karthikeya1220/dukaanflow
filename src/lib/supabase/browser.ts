import { createBrowserClient } from '@supabase/ssr'

// Singleton — one browser client per page load.
let client: ReturnType<typeof createBrowserClient> | undefined

export function getClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return client
}
