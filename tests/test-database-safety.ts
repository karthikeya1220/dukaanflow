const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export function assertSafeTestDatabaseTarget() {
  if (process.env.TEST_DB_MUTATIONS !== '1') {
    throw new Error('Database mutation tests require TEST_DB_MUTATIONS=1')
  }

  const databaseUrl = process.env.DATABASE_URL
  const expectedDatabase = process.env.TEST_DATABASE_NAME
  const expectedSchema = process.env.TEST_DATABASE_SCHEMA
  if (!databaseUrl || !expectedDatabase || !expectedSchema) {
    throw new Error(
      'Database mutation tests require DATABASE_URL, TEST_DATABASE_NAME, and TEST_DATABASE_SCHEMA',
    )
  }

  const parsed = new URL(databaseUrl)
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('Database mutation tests require a loopback database host')
  }
  if (databaseName !== expectedDatabase) {
    throw new Error(`Unexpected test database: expected ${expectedDatabase}, got ${databaseName}`)
  }
  if (expectedSchema !== 'public') {
    throw new Error(`Unexpected test schema: expected public, got ${expectedSchema}`)
  }
}
