const LOOPBACK_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
])

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname)
}

function parseHost(urlStr: string | undefined): string {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('Connection URL is missing or empty')
  }
  try {
    const parsed = new URL(urlStr)
    if (!parsed.hostname) {
      throw new Error(`Malformed connection URL: missing hostname in "${urlStr}"`)
    }
    return parsed.hostname
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Malformed connection URL:')) {
      throw err
    }
    throw new Error(`Malformed connection URL: unable to parse "${urlStr}"`)
  }
}

/**
 * Validates that both NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL point strictly
 * to local loopback interfaces.
 *
 * Requirements:
 * - Both destinations must be loopback.
 * - Rejects missing, malformed, or remote URLs.
 * - Remote override is strictly prohibited: demo seed data (@dukaanflow.test)
 *   must NEVER be seeded into remote or production databases.
 */
export function assertSafeSeedEnvironment(
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): void {
  if (!supabaseUrl) {
    throw new Error('[SEED BLOCKED] NEXT_PUBLIC_SUPABASE_URL is missing or empty.')
  }
  if (!databaseUrl) {
    throw new Error('[SEED BLOCKED] DATABASE_URL is missing or empty.')
  }

  const supabaseHost = parseHost(supabaseUrl)
  const databaseHost = parseHost(databaseUrl)

  if (!isLoopbackHost(supabaseHost)) {
    throw new Error(
      `[SEED BLOCKED] prisma/seed.ts is strictly prohibited on non-loopback Supabase URLs.\n` +
      `Target host: "${supabaseHost}". Demo seeds (@dukaanflow.test) cannot be applied to remote environments.`
    )
  }

  if (!isLoopbackHost(databaseHost)) {
    throw new Error(
      `[SEED BLOCKED] prisma/seed.ts is strictly prohibited on non-loopback database URLs.\n` +
      `Target database host: "${databaseHost}". Demo seeds cannot be applied to remote databases.`
    )
  }
}
