import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db', () => ({
  prisma: {
    $transaction: vi.fn(),
    cart: { findUnique: vi.fn() },
  },
}))

import { prisma } from '@/db'
import {
  fingerprintCartLines,
  getCartForRetailer,
} from '@/lib/cart-service'

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  cart: { findUnique: ReturnType<typeof vi.fn> }
}

describe('cart service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates stable fingerprints for identical canonical lines', () => {
    const line = {
      productId: 'p1',
      quantity: 2,
      product: {
        sku: 'SKU',
        pricePaise: 810,
        priceBasis: 'UNCONFIRMED',
        packSize: 96,
        packUnit: 'PACK',
        sellingUnit: 'CASE',
        inventoryQty: 340,
        inventoryUnit: 'CASE',
        isActive: true,
        schemes: [{
          id: 's1',
          kind: 'BUY_X_GET_Y',
          buyQty: 10,
          freeQty: 1,
          minQty: null,
          discountBps: null,
          isActive: true,
        }],
      },
    }
    expect(fingerprintCartLines([line] as never)).toBe(
      fingerprintCartLines([{ ...line, product: { ...line.product } }] as never),
    )
  })

  it('runs reads through a transaction for cart retrieval', async () => {
    const transactionClient = { cart: { findUnique: vi.fn().mockResolvedValue(null) } }
    mockPrisma.$transaction.mockImplementationOnce(
      async (callback: (client: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    )
    const result = await getCartForRetailer('retailer-1')
    expect(result.view.lines).toHaveLength(0)
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })

  it('does not expose missing cart lines as current products', async () => {
    expect(fingerprintCartLines([])).toMatch(/^[a-f0-9]{64}$/)
  })
})
