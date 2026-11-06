import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake prisma exposing the review status transition executing inside a transaction.
const { __txOrder } = vi.hoisted(() => {
  const txOrder = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  }
  return { __txOrder: { ...txOrder }, }
})

vi.mock('@/db', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({ order: __txOrder })),
    __txOrder,
  },
}))

import { updateOrderStatus } from '@/lib/order-service'
import { OrderStatus } from '@/generated/prisma/enums'
import { prisma } from '@/db'

const orderId = 'order-1'

const foundOrder = {
  id: orderId,
  retailerId: 'ret-1',
  cartId: 'cart-1',
  idempotencyKey: 'idem-1',
  status: OrderStatus.SUBMITTED,
  submittedAt: new Date(),
  updatedAt: new Date(),
  reservationExpiresAt: new Date(),
  inventoryReleasedAt: null,
  rejectionReason: null,
  reviewedByUserId: null,
  subtotalPaise: 100,
  discountPaise: 0,
  totalPaise: 100,
  priceBasisConfirmed: true,
  isSimulation: true,
  retailer: { email: 'retailer@example.test' },
  lines: [],
}

describe('order review status transitions (atomic)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Review transitions are policy-gated; enable for the transition path.
    process.env.ENABLE_ORDER_DESK_REVIEW = 'true'
  })

  it('applies the transition through a status-guarded conditional update inside a transaction', async () => {
    __txOrder.findUnique.mockResolvedValueOnce({ ...foundOrder }).mockResolvedValueOnce({
      ...foundOrder,
      status: OrderStatus.APPROVED,
      reviewedByUserId: 'reviewer-1',
    })
    __txOrder.updateMany.mockResolvedValue({ count: 1 })

    const view = await updateOrderStatus(orderId, OrderStatus.APPROVED, 'reviewer-1')

    expect(view.status).toBe(OrderStatus.APPROVED)
    expect(view.retailerEmail).toBe('retailer@example.test')
    // The update must be guarded by the current status, not by id alone.
    expect(__txOrder.updateMany).toHaveBeenCalledWith({
      where: { id: orderId, status: OrderStatus.SUBMITTED },
      data: expect.objectContaining({
        status: OrderStatus.APPROVED,
        reviewedByUserId: 'reviewer-1',
      }),
    })
  })

  it('rejects a lost race where another reviewer transitions first', async () => {
    __txOrder.findUnique.mockResolvedValueOnce({ ...foundOrder })
    __txOrder.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      updateOrderStatus(orderId, OrderStatus.REJECTED, 'reviewer-1'),
    ).rejects.toMatchObject({
      name: 'OrderServiceError',
      code: 'INVALID_STATUS_TRANSITION',
    })
  })

  it('rejects orders that are not in SUBMITTED state before attempting any update', async () => {
    __txOrder.findUnique.mockResolvedValue({ ...foundOrder, status: OrderStatus.APPROVED })

    await expect(
      updateOrderStatus(orderId, OrderStatus.REJECTED, 'reviewer-1'),
    ).rejects.toMatchObject({
      name: 'OrderServiceError',
      code: 'INVALID_STATUS_TRANSITION',
    })
    expect(__txOrder.updateMany).not.toHaveBeenCalled()
  })

  it('does not write inventory_release fields when rejecting', async () => {
    __txOrder.findUnique.mockResolvedValueOnce({ ...foundOrder }).mockResolvedValueOnce({
      ...foundOrder,
      status: OrderStatus.REJECTED,
    })
    __txOrder.updateMany.mockResolvedValue({ count: 1 })

    await updateOrderStatus(orderId, OrderStatus.REJECTED, 'reviewer-1', {
      rejectionReason: 'reason',
    })

    const data = (__txOrder.updateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data.rejectionReason).toBe('reason')
    expect('inventoryReleasedAt' in data).toBe(false)
    void prisma
  })
})
