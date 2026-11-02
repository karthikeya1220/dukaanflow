import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getCurrentUserWithRole BEFORE importing require-role
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserWithRole: vi.fn(),
}))

// Mock next/navigation interrupt functions
vi.mock('next/navigation', () => ({
  unauthorized: vi.fn(() => { throw new Error('UNAUTHORIZED') }),
  forbidden: vi.fn(() => { throw new Error('FORBIDDEN') }),
}))

import { requireRole, checkRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'

const mockGetCurrentUserWithRole = getCurrentUserWithRole as ReturnType<typeof vi.fn>

const retailerCtx = { user: { id: 'uid-1', email: 'r@d.test' }, role: 'RETAILER' as const }
const deskCtx = { user: { id: 'uid-2', email: 'd@d.test' }, role: 'ORDER_DESK' as const }

describe('requireRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws UNAUTHORIZED when not authenticated', async () => {
    mockGetCurrentUserWithRole.mockResolvedValueOnce(null)
    await expect(requireRole('RETAILER')).rejects.toThrow('UNAUTHORIZED')
  })
  it('throws FORBIDDEN when authenticated as wrong role', async () => {
    mockGetCurrentUserWithRole.mockResolvedValueOnce(deskCtx)
    await expect(requireRole('RETAILER')).rejects.toThrow('FORBIDDEN')
  })

  it('returns context when authenticated as correct role', async () => {
    mockGetCurrentUserWithRole.mockResolvedValueOnce(retailerCtx)
    const result = await requireRole('RETAILER')
    expect(result).toEqual(retailerCtx)
  })

  it('returns ORDER_DESK context when role matches', async () => {
    mockGetCurrentUserWithRole.mockResolvedValueOnce(deskCtx)
    const result = await requireRole('ORDER_DESK')
    expect(result).toEqual(deskCtx)
  })
})

describe('checkRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns { ok: false, code: UNAUTHORIZED } when not authenticated', async () => {
    mockGetCurrentUserWithRole.mockResolvedValueOnce(null)
    const result = await checkRole('RETAILER')
    expect(result).toEqual({ ok: false, code: 'UNAUTHORIZED' })
  })

  it('returns { ok: false, code: FORBIDDEN } when wrong role', async () => {
    mockGetCurrentUserWithRole.mockResolvedValueOnce(deskCtx)
    const result = await checkRole('RETAILER')
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' })
  })

  it('returns { ok: true, user, role } when role matches', async () => {
    mockGetCurrentUserWithRole.mockResolvedValueOnce(retailerCtx)
    const result = await checkRole('RETAILER')
    expect(result).toEqual({ ok: true, ...retailerCtx })
  })
})
