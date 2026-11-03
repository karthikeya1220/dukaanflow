import { beforeEach, describe, expect, it, vi } from 'vitest'

const { checkRole, findUnique } = vi.hoisted(() => ({
  checkRole: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({ checkRole }))
vi.mock('@/db', () => ({ prisma: { user: { findUnique } } }))
vi.mock('@/lib/cart-service', () => ({
  CartServiceError: class CartServiceError extends Error {},
  getCartForRetailer: vi.fn(),
  createNewCart: vi.fn(),
  getSubmittedCartsForRetailer: vi.fn(),
  addCartProduct: vi.fn(),
  updateCartLine: vi.fn(),
  removeCartLine: vi.fn(),
  clearCart: vi.fn(),
  confirmCart: vi.fn(),
}))

import { getCartHistory, getCurrentCart } from '@/app/actions/cart'

describe('cart Server Action authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUnique.mockResolvedValue({ id: 'retailer-1' })
  })

  it('rejects unauthenticated callers before database access', async () => {
    checkRole.mockResolvedValue({ ok: false, code: 'UNAUTHORIZED' })

    await expect(getCurrentCart()).resolves.toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    })
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('rejects wrong-role callers before database access', async () => {
    checkRole.mockResolvedValue({ ok: false, code: 'FORBIDDEN' })

    await expect(getCartHistory()).resolves.toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(findUnique).not.toHaveBeenCalled()
  })
})
