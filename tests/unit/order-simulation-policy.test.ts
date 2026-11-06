import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCurrentUserWithRole, findUnique, submitCartToOrder } = vi.hoisted(() => ({
  getCurrentUserWithRole: vi.fn(),
  findUnique: vi.fn(),
  submitCartToOrder: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getCurrentUserWithRole }))
vi.mock('@/db', () => ({ prisma: { user: { findUnique } } }))

vi.mock('@/lib/order-service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/order-service')>()
  return {
    ...original,
    submitCartToOrder,
  }
})

import { submitOrder, submitSimulationOrder } from '@/app/actions/order'

function mockRetailer() {
  getCurrentUserWithRole.mockResolvedValue({
    user: { id: 'auth-uid-1' },
    role: 'RETAILER',
  })
  findUnique.mockResolvedValue({ id: 'db-user-1' })
}

const fakeOrder = { id: 'order-1', isSimulation: false, totalPaise: 0, lines: [] }

describe('simulation authorization (server-decided, never client-supplied)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submitOrder ignores a client attempt to claim isSimulation=true', async () => {
    mockRetailer()
    submitCartToOrder.mockResolvedValue({ ...fakeOrder, isSimulation: false })

    const res = await submitOrder({
      idempotencyKey: 'idem-1',
      // Attacker-supplied parameter — the schema must strip it.
      isSimulation: true,
    })

    expect(res.ok).toBe(true)
    expect(submitCartToOrder).toHaveBeenCalledWith(
      'db-user-1',
      { idempotencyKey: 'idem-1', isSimulation: false },
    )
  })

  it('submitSimulationOrder always forces isSimulation=true', async () => {
    mockRetailer()
    submitCartToOrder.mockResolvedValue({ ...fakeOrder, isSimulation: true })

    const res = await submitSimulationOrder({ idempotencyKey: 'idem-2' })

    expect(res.ok).toBe(true)
    expect(submitCartToOrder).toHaveBeenCalledWith(
      'db-user-1',
      { idempotencyKey: 'idem-2', isSimulation: true },
    )
  })

  it('commercial submission keeps isSimulation=false even with spoofed fields on both actions', async () => {
    mockRetailer()
    submitCartToOrder.mockResolvedValue(fakeOrder)

    await submitOrder({ idempotencyKey: 'k1', isSimulation: true })
    await submitSimulationOrder({ idempotencyKey: 'k2', isSimulation: 'true' as unknown as boolean })

    const calls = submitCartToOrder.mock.calls as unknown as Array<
      [string, { isSimulation: boolean }]
    >
    // Commercial action never flips to simulation…
    expect(calls[0][1].isSimulation).toBe(false)
    // …and the simulation action always flips to true server-side regardless of input.
    expect(calls[1][1].isSimulation).toBe(true)
  })

  it('rejects consumers without a retailer role before submission', async () => {
    getCurrentUserWithRole.mockResolvedValue({ user: { id: 'auth-uid-2' }, role: 'ORDER_DESK' })
    findUnique.mockResolvedValue({ id: 'db-user-2' })

    const res = await submitSimulationOrder({ idempotencyKey: 'k3' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('FORBIDDEN')
    expect(submitCartToOrder).not.toHaveBeenCalled()
  })

  it('requires an idempotency key', async () => {
    mockRetailer()

    const res = await submitOrder({})
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_INPUT')
    expect(submitCartToOrder).not.toHaveBeenCalled()
  })
})
