import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/db'
import {
  addCartProduct,
  clearCart,
  confirmCart,
  createNewCart,
} from '@/lib/cart-service'
import { submitCartToOrder, updateOrderStatus } from '@/lib/order-service'
import { generateTallyCsvData } from '@/lib/tally-export'
import { assertSafeTestDatabaseTarget } from '../test-database-safety'

const canRunIntegration =
  process.env.TEST_DB_MUTATIONS === '1' &&
  Boolean(process.env.TEST_DATABASE_NAME) &&
  Boolean(process.env.TEST_DATABASE_SCHEMA)

const describeIfDatabase = canRunIntegration ? describe : describe.skip

describeIfDatabase('order service integration & isolation', () => {
  let retailer: { id: string }
  let deskUser: { id: string }
  let product: { id: string }
  let unconfirmedProduct: { id: string }
  let setupComplete = false

  beforeAll(async () => {
    assertSafeTestDatabaseTarget()
    const suffix = Date.now().toString()
    retailer = await prisma.user.create({
      data: {
        authSubject: `integration-order-retailer-${suffix}`,
        email: `integration-order-retailer-${suffix}@example.test`,
        role: 'RETAILER',
      },
      select: { id: true },
    })

    deskUser = await prisma.user.create({
      data: {
        authSubject: `integration-order-desk-${suffix}`,
        email: `integration-order-desk-${suffix}@example.test`,
        role: 'ORDER_DESK',
      },
      select: { id: true },
    })

    product = await prisma.product.create({
      data: {
        sku: `ORD-SKU-${suffix}`,
        name: 'Order Integration Biscuit',
        packSize: 10,
        packUnit: 'PIECE',
        sellingUnit: 'CASE',
        inventoryUnit: 'CASE',
        pricePaise: 1200,
        priceBasis: 'PER_CASE',
        inventoryQty: 50,
        isActive: true,
      },
      select: { id: true },
    })

    unconfirmedProduct = await prisma.product.create({
      data: {
        sku: `ORD-UNCONF-${suffix}`,
        name: 'Order Unconfirmed Product',
        packSize: 12,
        packUnit: 'PIECE',
        sellingUnit: 'CASE',
        inventoryUnit: 'CASE',
        pricePaise: 2500,
        priceBasis: 'UNCONFIRMED',
        inventoryQty: 50,
        isActive: true,
      },
      select: { id: true },
    })

    setupComplete = true
  })

  afterAll(async () => {
    if (!setupComplete) return
    await prisma.order.deleteMany({
      where: { retailerId: retailer.id },
    })
    await prisma.cart.deleteMany({
      where: { retailerId: retailer.id },
    })
    await prisma.product.deleteMany({
      where: { id: { in: [product.id, unconfirmedProduct.id] } },
    })
    await prisma.user.deleteMany({
      where: { id: { in: [retailer.id, deskUser.id] } },
    })
  })

  it('blocks real commercial submission when policy is not explicitly enabled', async () => {
    await createNewCart(retailer.id)
    await clearCart(retailer.id)
    await addCartProduct(retailer.id, product.id, 2)
    await confirmCart(retailer.id)

    // With ENABLE_COMMERCIAL_SUBMISSION undefined / false, commercial submission is safely blocked
    await expect(
      submitCartToOrder(retailer.id, {
        idempotencyKey: `idemp-comm-blocked-${Date.now()}`,
        isSimulation: false,
      }),
    ).rejects.toMatchObject({
      code: 'COMMERCIAL_SUBMISSION_BLOCKED',
    })
  })

  it('allows simulation submission and sets isSimulation=true discriminator', async () => {
    const key = `idemp-sim-${Date.now()}`
    const order = await submitCartToOrder(retailer.id, {
      idempotencyKey: key,
      isSimulation: true,
    })

    expect(order.id).toBeTruthy()
    expect(order.status).toBe('SUBMITTED')
    expect(order.isSimulation).toBe(true)
    expect(order.lines).toHaveLength(1)
    expect(order.lines[0].paidQty).toBe(2)

    // Verify persisted in DB with isSimulation=true
    const dbOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { isSimulation: true, status: true },
    })
    expect(dbOrder.isSimulation).toBe(true)
  })

  it('proves simulation orders are excluded from commercial Tally CSV data while eligible commercial fixtures are included', async () => {
    const simKey = `idemp-sim-csv-${Date.now()}`
    await createNewCart(retailer.id)
    await clearCart(retailer.id)
    await addCartProduct(retailer.id, product.id, 1)
    await confirmCart(retailer.id)

    const simOrder = await submitCartToOrder(retailer.id, {
      idempotencyKey: simKey,
      isSimulation: true,
    })

    // Create an explicit eligible commercial fixture in the database
    const cartComm = await prisma.cart.create({
      data: { retailerId: retailer.id, status: 'SUBMITTED', submittedAt: new Date() },
      select: { id: true },
    })
    const commKey = `idemp-comm-eligible-${Date.now()}`
    const commercialOrder = await prisma.order.create({
      data: {
        retailerId: retailer.id,
        cartId: cartComm.id,
        idempotencyKey: commKey,
        status: 'SUBMITTED',
        reservationExpiresAt: new Date(Date.now() + 86400000),
        subtotalPaise: 2400,
        discountPaise: 0,
        totalPaise: 2400,
        priceBasisConfirmed: true,
        isSimulation: false,
        lines: {
          create: {
            productId: product.id,
            sku: 'ORD-COMM-FIXTURE',
            productName: 'Eligible Commercial Biscuit',
            paidQty: 2,
            freeQty: 0,
            reservedQty: 2,
            sellingUnit: 'CASE',
            inventoryUnit: 'CASE',
            unitPricePaise: 1200,
            priceBasis: 'PER_CASE',
            grossPaise: 2400,
            discountPaise: 0,
            totalPaise: 2400,
          },
        },
      },
      include: {
        retailer: { select: { email: true } },
        lines: true,
      },
    })

    // Create an ineligible commercial order fixture with unconfirmed price basis
    const cartUnconf = await prisma.cart.create({
      data: { retailerId: retailer.id, status: 'SUBMITTED', submittedAt: new Date() },
      select: { id: true },
    })
    const unconfKey = `idemp-comm-unconf-${Date.now()}`
    const ineligibleOrder = await prisma.order.create({
      data: {
        retailerId: retailer.id,
        cartId: cartUnconf.id,
        idempotencyKey: unconfKey,
        status: 'SUBMITTED',
        reservationExpiresAt: new Date(Date.now() + 86400000),
        subtotalPaise: 1000,
        discountPaise: 0,
        totalPaise: 1000,
        priceBasisConfirmed: false,
        isSimulation: false,
        lines: {
          create: {
            productId: unconfirmedProduct.id,
            sku: 'ORD-UNCONF-FIXTURE',
            productName: 'Ineligible Unconfirmed Product',
            paidQty: 1,
            freeQty: 0,
            reservedQty: 1,
            sellingUnit: 'CASE',
            inventoryUnit: 'CASE',
            unitPricePaise: 1000,
            priceBasis: 'UNCONFIRMED',
            grossPaise: 1000,
            discountPaise: 0,
            totalPaise: 1000,
          },
        },
      },
      include: {
        retailer: { select: { email: true } },
        lines: true,
      },
    })

    // Fetch commercial orders applying the exact export gate: isSimulation: false & priceBasisConfirmed: true
    const eligibleOrders = await prisma.order.findMany({
      where: { isSimulation: false, priceBasisConfirmed: true },
      include: {
        retailer: { select: { email: true } },
        lines: true,
      },
    })

    const csvOutput = generateTallyCsvData(
      eligibleOrders.map((o) => ({
        ...o,
        lines: o.lines.map((l) => ({ ...l, schemeKind: l.schemeKind ?? null, schemeId: l.schemeId ?? null })),
      })),
    )

    // 1. Simulation order reference must NEVER appear in the commercial CSV output
    expect(csvOutput).not.toContain(simOrder.id)
    // 2. Eligible commercial order must be included
    expect(csvOutput).toContain(commercialOrder.id)
    expect(csvOutput).toContain('ORD-COMM-FIXTURE')
    // 3. Ineligible order with unconfirmed price basis must NOT appear
    expect(csvOutput).not.toContain(ineligibleOrder.id)
  })

  it('blocks order status review when authorization policy is disabled', async () => {
    const simKey = `idemp-review-${Date.now()}`
    await createNewCart(retailer.id)
    await clearCart(retailer.id)
    await addCartProduct(retailer.id, product.id, 1)
    await confirmCart(retailer.id)

    const order = await submitCartToOrder(retailer.id, {
      idempotencyKey: simKey,
      isSimulation: true,
    })

    // By default, ENABLE_ORDER_DESK_REVIEW is not 'true'
    await expect(
      updateOrderStatus(order.id, 'APPROVED', deskUser.id),
    ).rejects.toMatchObject({
      code: 'REVIEW_POLICY_DISABLED',
    })
  })

  it('guarantees simulation submission leaves Product.inventoryQty completely unchanged', async () => {
    const beforeProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { inventoryQty: true },
    })

    await createNewCart(retailer.id)
    await clearCart(retailer.id)
    await addCartProduct(retailer.id, product.id, 5)
    await confirmCart(retailer.id)

    const simKey = `idemp-stock-check-${Date.now()}`
    await submitCartToOrder(retailer.id, {
      idempotencyKey: simKey,
      isSimulation: true,
    })

    const afterProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { inventoryQty: true },
    })

    // Inventory must remain exactly the same
    expect(afterProduct.inventoryQty).toBe(beforeProduct.inventoryQty)
  })

  it('proves duplicate simulation submissions with same idempotencyKey return identical order without duplication', async () => {
    const duplicateKey = `idemp-sim-dup-${Date.now()}`
    await createNewCart(retailer.id)
    await clearCart(retailer.id)
    await addCartProduct(retailer.id, product.id, 2)
    await confirmCart(retailer.id)

    const first = await submitCartToOrder(retailer.id, {
      idempotencyKey: duplicateKey,
      isSimulation: true,
    })

    const second = await submitCartToOrder(retailer.id, {
      idempotencyKey: duplicateKey,
      isSimulation: true,
    })

    expect(first.id).toBe(second.id)
    const matchingOrderCount = await prisma.order.count({
      where: { retailerId: retailer.id, idempotencyKey: duplicateKey },
    })
    expect(matchingOrderCount).toBe(1)
  })
})
