import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/db'
import {
  addCartProduct,
  clearCart,
  confirmCart,
  getCartForRetailer,
  removeCartLine,
} from '@/lib/cart-service'

const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeIfDatabase('cart service integration', () => {
  let retailerA: { id: string }
  let retailerB: { id: string }
  let orderDesk: { id: string }
  let product: { id: string }
  let zeroStockProduct: { id: string }

  beforeAll(async () => {
    const suffix = Date.now().toString()
    ;[retailerA, retailerB, orderDesk] = await prisma.$transaction([
      prisma.user.create({
        data: {
          authSubject: `integration-retailer-a-${suffix}`,
          email: `integration-retailer-a-${suffix}@example.test`,
          role: 'RETAILER',
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          authSubject: `integration-retailer-b-${suffix}`,
          email: `integration-retailer-b-${suffix}@example.test`,
          role: 'RETAILER',
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          authSubject: `integration-desk-${suffix}`,
          email: `integration-desk-${suffix}@example.test`,
          role: 'ORDER_DESK',
        },
        select: { id: true },
      }),
    ])

    product = await prisma.product.create({
      data: {
        sku: `INT-${suffix}`,
        name: 'Integration Biscuit',
        pricePaise: 810,
        priceBasis: 'UNCONFIRMED',
        packSize: 96,
        packUnit: 'PACK',
        sellingUnit: 'CASE',
        inventoryQty: 100,
        inventoryUnit: 'CASE',
        schemes: {
          create: {
            kind: 'BUY_X_GET_Y',
            buyQty: 10,
            freeQty: 1,
            isActive: true,
          },
        },
      },
      select: { id: true },
    })
    zeroStockProduct = await prisma.product.create({
      data: {
        sku: `INT-ZERO-${suffix}`,
        name: 'Integration Zero Stock',
        pricePaise: 100,
        priceBasis: 'UNCONFIRMED',
        packSize: 1,
        packUnit: 'CASE',
        sellingUnit: 'CASE',
        inventoryQty: 0,
        inventoryUnit: 'CASE',
      },
      select: { id: true },
    })
  })

  afterAll(async () => {
    await prisma.cart.deleteMany({
      where: { retailerId: { in: [retailerA.id, retailerB.id] } },
    })
    await prisma.product.deleteMany({
      where: { id: { in: [product.id, zeroStockProduct.id] } },
    })
    await prisma.user.deleteMany({
      where: { id: { in: [retailerA.id, retailerB.id, orderDesk.id] } },
    })
    await prisma.$disconnect()
  })

  it('persists carts, isolates retailers, and increments one line', async () => {
    const first = await addCartProduct(retailerA.id, product.id, 10)
    expect(first.view.lines).toHaveLength(1)
    expect(first.view.lines[0].quantity).toBe(10)
    expect(first.view.lines[0].calculation?.freeQty).toBe(1)

    await addCartProduct(retailerA.id, product.id, 2)
    const current = await getCartForRetailer(retailerA.id)
    expect(current.view.lines[0].quantity).toBe(12)
    expect((await getCartForRetailer(retailerB.id)).view.lines).toHaveLength(0)
    expect((await removeCartLine(retailerB.id, current.view.lines[0].id)).view.lines).toHaveLength(0)
  })

  it('preserves concurrent additions and does not mutate inventory', async () => {
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { inventoryQty: true },
    })
    await clearCart(retailerA.id)
    await Promise.all(
      Array.from({ length: 4 }, () => addCartProduct(retailerA.id, product.id, 3)),
    )
    const current = await getCartForRetailer(retailerA.id)
    expect(current.view.lines[0].quantity).toBe(12)
    expect(
      (await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { inventoryQty: true },
      })).inventoryQty,
    ).toBe(before.inventoryQty)
  })

  it('persists confirmation and reopens when current stock changes', async () => {
    await clearCart(retailerA.id)
    await addCartProduct(retailerA.id, product.id, 10)
    const confirmed = await confirmCart(retailerA.id)
    expect(confirmed.view.status).toBe('CONFIRMED')
    expect(confirmed.view.confirmedFingerprint).toMatch(/^[a-f0-9]{64}$/)

    await prisma.product.update({
      where: { id: product.id },
      data: { inventoryQty: 5 },
    })
    const stale = await getCartForRetailer(retailerA.id)
    expect(stale.stale).toBe(true)
    expect(stale.view.status).toBe('ACTIVE')
    expect(stale.view.confirmedAt).toBeNull()
    expect(stale.view.confirmedFingerprint).toBeNull()
    await prisma.product.update({
      where: { id: product.id },
      data: { inventoryQty: 100 },
    })
  })

  it('blocks confirmation when required stock is unavailable', async () => {
    await clearCart(retailerA.id)
    await addCartProduct(retailerA.id, zeroStockProduct.id, 1)
    await expect(confirmCart(retailerA.id)).rejects.toMatchObject({
      code: 'STALE_CART',
    })
  })
})
