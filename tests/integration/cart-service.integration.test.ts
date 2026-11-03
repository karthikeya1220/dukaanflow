import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/db'
import {
  addCartProduct,
  clearCart,
  confirmCart,
  createNewCart,
  getCartForRetailer,
  getSubmittedCartsForRetailer,
  removeCartLine,
  updateCartLine,
} from '@/lib/cart-service'
import { assertSafeTestDatabaseTarget } from '../test-database-safety'

const canRunIntegration =
  process.env.TEST_DB_MUTATIONS === '1' &&
  Boolean(process.env.TEST_DATABASE_NAME) &&
  Boolean(process.env.TEST_DATABASE_SCHEMA)

const describeIfDatabase = canRunIntegration ? describe : describe.skip

describeIfDatabase('cart service integration', () => {
  let retailerA: { id: string }
  let retailerB: { id: string }
  let orderDesk: { id: string }
  let product: { id: string }
  let zeroStockProduct: { id: string }
  let setupComplete = false

  beforeAll(async () => {
    assertSafeTestDatabaseTarget()
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
    setupComplete = true
  })

  afterAll(async () => {
    if (!setupComplete) return
    await prisma.order.deleteMany({
      where: { retailerId: { in: [retailerA.id, retailerB.id] } },
    })
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

  it('keeps confirmed carts out of current-cart operations', async () => {
    await clearCart(retailerA.id)
    await addCartProduct(retailerA.id, product.id, 10)
    const confirmed = await confirmCart(retailerA.id)
    expect(confirmed.view.status).toBe('CONFIRMED')
    expect(confirmed.view.confirmedFingerprint).toMatch(/^[a-f0-9]{64}$/)
    const confirmedCartId = confirmed.view.id

    const stale = await getCartForRetailer(retailerA.id)
    expect(stale.view.id).toBeNull()
    const replacement = await createNewCart(retailerA.id)
    expect(replacement.view.status).toBe('ACTIVE')
    expect(replacement.view.id).not.toBe(confirmedCartId)
    expect(
      await prisma.cart.findUniqueOrThrow({
        where: { id: confirmedCartId! },
        select: { status: true, confirmedFingerprint: true },
      }),
    ).toMatchObject({ status: 'CONFIRMED', confirmedFingerprint: confirmed.view.confirmedFingerprint })
  })

  it('blocks confirmation when required stock is unavailable', async () => {
    await createNewCart(retailerA.id)
    await clearCart(retailerA.id)
    await addCartProduct(retailerA.id, zeroStockProduct.id, 1)
    await expect(confirmCart(retailerA.id)).rejects.toMatchObject({
      code: 'STALE_CART',
    })
  })

  it('preserves submitted history and creates one concurrent active cart', async () => {
    await clearCart(retailerB.id)
    await addCartProduct(retailerB.id, product.id, 2)
    const submitted = await getCartForRetailer(retailerB.id)
    expect(submitted.view.id).toBeTruthy()

    await prisma.cart.update({
      where: { id: submitted.view.id! },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    })
    await prisma.order.create({
      data: {
        retailerId: retailerB.id,
        cartId: submitted.view.id!,
        idempotencyKey: `integration-key-${Date.now()}`,
        reservationExpiresAt: new Date(Date.now() + 86_400_000),
        subtotalPaise: 1620,
        discountPaise: 0,
        totalPaise: 1620,
        priceBasisConfirmed: true,
        lines: {
          create: {
            productId: product.id,
            sku: 'INT',
            productName: 'Integration Biscuit',
            paidQty: 2,
            freeQty: 0,
            reservedQty: 2,
            sellingUnit: 'CASE',
            inventoryUnit: 'CASE',
            unitPricePaise: 810,
            priceBasis: 'PER_CASE',
            grossPaise: 1620,
            discountPaise: 0,
            totalPaise: 1620,
          },
        },
      },
    })

    const history = await getSubmittedCartsForRetailer(retailerB.id)
    expect(history).toHaveLength(1)
    expect(history[0].id).toBe(submitted.view.id)
    expect(history[0].lines[0].quantity).toBe(2)
    expect(history[0].order?.retailerId).toBe(retailerB.id)
    expect((await getSubmittedCartsForRetailer(retailerA.id))).toHaveLength(0)

    const [first, second] = await Promise.all([
      createNewCart(retailerB.id),
      createNewCart(retailerB.id),
    ])
    expect(first.view.id).toBeTruthy()
    expect(second.view.id).toBe(first.view.id)
    expect(first.view.status).toBe('ACTIVE')
    expect(
      await prisma.cart.count({ where: { retailerId: retailerB.id, status: 'ACTIVE' } }),
    ).toBe(1)

    await expect(
      updateCartLine(retailerB.id, history[0].lines[0].id, 3),
    ).rejects.toMatchObject({ code: 'CART_ALREADY_SUBMITTED' })
    expect((await getSubmittedCartsForRetailer(retailerB.id))[0].lines[0].quantity).toBe(2)
  })

  it('rejects submitted clear and confirmation without revealing foreign carts', async () => {
    await createNewCart(retailerA.id)
    await clearCart(retailerA.id)
    await addCartProduct(retailerA.id, product.id, 1)
    const submitted = await getCartForRetailer(retailerA.id)
    await prisma.cart.update({
      where: { id: submitted.view.id! },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    })

    await expect(clearCart(retailerA.id)).rejects.toMatchObject({
      code: 'CART_ALREADY_SUBMITTED',
    })
    await expect(confirmCart(retailerA.id)).rejects.toMatchObject({
      code: 'CART_ALREADY_SUBMITTED',
    })
    await expect(clearCart(retailerB.id)).resolves.toMatchObject({
      view: { id: expect.any(String) },
    })
  })

  it('does not expose an order whose retailer differs from the cart owner', async () => {
    await createNewCart(retailerB.id)
    await clearCart(retailerB.id)
    await addCartProduct(retailerB.id, product.id, 1)
    const cart = await getCartForRetailer(retailerB.id)
    await prisma.cart.update({
      where: { id: cart.view.id! },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    })
    await prisma.order.create({
      data: {
        retailerId: retailerA.id,
        cartId: cart.view.id!,
        idempotencyKey: `mismatched-${Date.now()}`,
        reservationExpiresAt: new Date(Date.now() + 86_400_000),
        subtotalPaise: 810,
        discountPaise: 0,
        totalPaise: 810,
        priceBasisConfirmed: false,
      },
    })

    const history = await getSubmittedCartsForRetailer(retailerB.id)
    const mismatchedHistory = history.find((item) => item.id === cart.view.id)
    expect(mismatchedHistory?.order).toBeNull()
  })
})
