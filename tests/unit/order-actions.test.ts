import { describe, expect, it } from 'vitest'
import { submitOrder, reviewOrder } from '@/app/actions/order'

describe('Order Server Actions', () => {
  it('rejects order submission without authentication', async () => {
    const res = await submitOrder({ idempotencyKey: 'test-key' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('UNAUTHORIZED')
    }
  })

  it('rejects order review without authentication', async () => {
    const res = await reviewOrder({ orderId: 'test-order', status: 'APPROVED' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('UNAUTHORIZED')
    }
  })
})

