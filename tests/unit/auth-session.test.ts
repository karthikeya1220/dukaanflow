import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks ---

interface MockPrisma {
  user: {
    findUnique: ReturnType<typeof vi.fn>
  }
}

vi.mock('@/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
} as unknown as MockPrisma))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// --- Imports (after mocks) ---
import { resolveRole, getServerUser, getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { createClient } from '@/lib/supabase/server'

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
}
const mockCreateClient = createClient as unknown as ReturnType<typeof vi.fn>

describe('resolveRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns RETAILER for a known authSubject', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ role: 'RETAILER' })
    const role = await resolveRole('uid-123')
    expect(role).toBe('RETAILER')
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { authSubject: 'uid-123' },
      select: { role: true },
    })
  })
  it('returns ORDER_DESK for a known authSubject', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ role: 'ORDER_DESK' })
    const role = await resolveRole('uid-456')
    expect(role).toBe('ORDER_DESK')
  })

  it('returns null for an unknown authSubject', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    const role = await resolveRole('uid-unknown')
    expect(role).toBeNull()
  })

  it('returns null when Prisma throws', async () => {
    mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('db error'))
    const role = await resolveRole('uid-err')
    expect(role).toBeNull()
  })
})

describe('getServerUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the user when getUser succeeds', async () => {
    const fakeUser = { id: 'uid-1', email: 'a@b.com' }
    mockCreateClient.mockResolvedValueOnce({
      auth: { getUser: async () => ({ data: { user: fakeUser }, error: null }) },
    })
    const user = await getServerUser()
    expect(user).toEqual(fakeUser)
  })

  it('returns null when getUser returns an error', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: new Error('auth error'),
        }),
      },
    })
    const user = await getServerUser()
    expect(user).toBeNull()
  })

  it('returns null when createClient throws', async () => {
    mockCreateClient.mockRejectedValueOnce(new Error('no cookies'))
    const user = await getServerUser()
    expect(user).toBeNull()
  })
})

describe('getCurrentUserWithRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    })
    const result = await getCurrentUserWithRole()
    expect(result).toBeNull()
  })

  it('returns null when user has no public.users record', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: { getUser: async () => ({ data: { user: { id: 'uid-1' } }, error: null }) },
    })
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    const result = await getCurrentUserWithRole()
    expect(result).toBeNull()
  })

  it('returns user and role when both are present', async () => {
    const fakeUser = { id: 'uid-1', email: 'r@d.test' }
    mockCreateClient.mockResolvedValueOnce({
      auth: { getUser: async () => ({ data: { user: fakeUser }, error: null }) },
    })
    mockPrisma.user.findUnique.mockResolvedValueOnce({ role: 'RETAILER' })
    const result = await getCurrentUserWithRole()
    expect(result).toEqual({ user: fakeUser, role: 'RETAILER' })
  })
})
