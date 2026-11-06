import { describe, expect, it } from 'vitest'
import { assertSafeSeedEnvironment } from '@/lib/seed-safety'

describe('assertSafeSeedEnvironment (Seed Protection Guard)', () => {
  it('allows execution when both Supabase URL and Database URL are loopback', () => {
    expect(() =>
      assertSafeSeedEnvironment(
        'http://127.0.0.1:54321',
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      ),
    ).not.toThrow()

    expect(() =>
      assertSafeSeedEnvironment(
        'http://localhost:54321',
        'postgresql://postgres:postgres@localhost:54322/postgres',
      ),
    ).not.toThrow()
  })

  it('rejects when Supabase URL is loopback but Database URL is remote', () => {
    expect(() =>
      assertSafeSeedEnvironment(
        'http://127.0.0.1:54321',
        'postgresql://postgres.prod:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
      ),
    ).toThrowError(/strictly prohibited on non-loopback database URLs/)
  })

  it('rejects when Supabase URL is remote but Database URL is loopback', () => {
    expect(() =>
      assertSafeSeedEnvironment(
        'https://xyzcompany.supabase.co',
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      ),
    ).toThrowError(/strictly prohibited on non-loopback Supabase URLs/)
  })

  it('rejects when Database URL is missing or empty', () => {
    expect(() =>
      assertSafeSeedEnvironment('http://127.0.0.1:54321', undefined),
    ).toThrowError(/DATABASE_URL is missing or empty/)

    expect(() =>
      assertSafeSeedEnvironment('http://127.0.0.1:54321', ''),
    ).toThrowError(/DATABASE_URL is missing or empty/)
  })

  it('rejects when Database URL is malformed', () => {
    expect(() =>
      assertSafeSeedEnvironment('http://127.0.0.1:54321', 'not-a-valid-url:::'),
    ).toThrowError(/Malformed connection URL/)
  })

  it('rejects 0.0.0.0 as a loopback host', () => {
    expect(() =>
      assertSafeSeedEnvironment(
        'http://0.0.0.0:54321',
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      ),
    ).toThrowError(/strictly prohibited on non-loopback Supabase URLs/)

    expect(() =>
      assertSafeSeedEnvironment(
        'http://127.0.0.1:54321',
        'postgresql://postgres:postgres@0.0.0.0:54322/postgres',
      ),
    ).toThrowError(/strictly prohibited on non-loopback database URLs/)
  })

  it('does not allow remote override even if ALLOW_PRODUCTION_SEED is set in environment', () => {
    const originalEnv = process.env.ALLOW_PRODUCTION_SEED
    try {
      process.env.ALLOW_PRODUCTION_SEED = 'true'
      expect(() =>
        assertSafeSeedEnvironment(
          'https://production.supabase.co',
          'postgresql://postgres.prod:secret@db.production.supabase.co:5432/postgres',
        ),
      ).toThrowError(/strictly prohibited on non-loopback Supabase URLs/)
    } finally {
      process.env.ALLOW_PRODUCTION_SEED = originalEnv
    }
  })
})

