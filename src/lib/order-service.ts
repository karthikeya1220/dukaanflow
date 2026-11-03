import { prisma } from '@/db'
import { PriceBasis, ProductUnit, SchemeKind, OrderStatus } from '@/generated/prisma/enums'
import { calculateLine } from '@/lib/cart-calculation'

export type OrderServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CART_EMPTY'
  | 'CART_NOT_CONFIRMED'
  | 'PRICE_BASIS_UNCONFIRMED'
  | 'INSUFFICIENT_STOCK'
  | 'PRODUCT_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'ORDER_NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'SIMULATION_ONLY'
  | 'COMMERCIAL_SUBMISSION_BLOCKED'
  | 'REVIEW_POLICY_DISABLED'
  | 'INTERNAL_ERROR'

export class OrderServiceError extends Error {
  constructor(
    public readonly code: OrderServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OrderServiceError'
  }
}

export interface SubmitOrderOptions {
  idempotencyKey: string
  isSimulation?: boolean
}

export interface OrderLineView {
  id: string
  productId: string | null
  sku: string
  productName: string
  paidQty: number
  freeQty: number
  reservedQty: number
  sellingUnit: ProductUnit
  inventoryUnit: ProductUnit
  unitPricePaise: number
  priceBasis: PriceBasis
  grossPaise: number
  discountPaise: number
  totalPaise: number
  schemeKind: SchemeKind | null
  schemeId: string | null
}

export interface OrderView {
  id: string
  retailerId: string
  retailerEmail?: string
  cartId: string
  idempotencyKey: string
  status: OrderStatus
  submittedAt: Date
  updatedAt: Date
  reservationExpiresAt: Date
  inventoryReleasedAt: Date | null
  rejectionReason: string | null
  reviewedByUserId: string | null
  subtotalPaise: number
  discountPaise: number
  totalPaise: number
  priceBasisConfirmed: boolean
  isSimulation: boolean
  lines: OrderLineView[]
}

/**
 * Checks whether commercial order submission is explicitly enabled by the distributor.
 * In DukaanFlow, until distributor approves inventory reservation and pricing authority policies,
 * commercial submissions remain blocked by default unless ENABLE_COMMERCIAL_SUBMISSION=true is configured.
 */
export function isCommercialSubmissionEnabled(): boolean {
  return process.env.ENABLE_COMMERCIAL_SUBMISSION === 'true'
}

/**
 * Checks whether order review (approval/rejection) authorization policy is enabled.
 * Defaults to false until distributor operations and audit sign-off.
 */
export function isOrderReviewPolicyEnabled(): boolean {
  return process.env.ENABLE_ORDER_DESK_REVIEW === 'true'
}

/**
 * Submits a CONFIRMED cart into an immutable Order + OrderLine snapshot.
 *
 * Safeguards:
 * 1. If not isSimulation, checks commercial submission gate (blocked if inventory policy unapproved).
 * 2. If not isSimulation, UNCONFIRMED price basis is strictly blocked.
 * 3. Simulation orders are explicitly marked with isSimulation=true.
 * 4. Idempotency is enforced per retailer.
 * 5. Carts transition to SUBMITTED atomically.
 */
export async function submitCartToOrder(
  retailerId: string,
  options: SubmitOrderOptions,
): Promise<OrderView> {
  const { idempotencyKey, isSimulation = false } = options

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new OrderServiceError('IDEMPOTENCY_CONFLICT', 'A valid idempotencyKey is required')
  }

  // Commercial Policy Gate: block commercial submission if distributor policy is unapproved
  if (!isSimulation && !isCommercialSubmissionEnabled()) {
    throw new OrderServiceError(
      'COMMERCIAL_SUBMISSION_BLOCKED',
      'Commercial order submission is currently disabled pending distributor inventory reservation policy approval. Please use Simulation Mode for end-to-end testing.',
    )
  }

  // Check if order with this idempotency key already exists for this retailer
  const existingOrder = await prisma.order.findUnique({
    where: {
      retailerId_idempotencyKey: {
        retailerId,
        idempotencyKey,
      },
    },
    include: {
      lines: { orderBy: { id: 'asc' } },
    },
  })

  if (existingOrder) {
    return {
      ...existingOrder,
      lines: existingOrder.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        sku: l.sku,
        productName: l.productName,
        paidQty: l.paidQty,
        freeQty: l.freeQty,
        reservedQty: l.reservedQty,
        sellingUnit: l.sellingUnit,
        inventoryUnit: l.inventoryUnit,
        unitPricePaise: l.unitPricePaise,
        priceBasis: l.priceBasis,
        grossPaise: l.grossPaise,
        discountPaise: l.discountPaise,
        totalPaise: l.totalPaise,
        schemeKind: l.schemeKind,
        schemeId: l.schemeId,
      })),
    }
  }

  return prisma.$transaction(async (tx) => {
    // Lock and fetch retailer's CONFIRMED cart
    const cart = await tx.cart.findFirst({
      where: {
        retailerId,
        status: 'CONFIRMED',
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        lines: {
          include: {
            product: {
              include: { schemes: { where: { isActive: true } } },
            },
          },
          orderBy: { productId: 'asc' },
        },
      },
    })

    if (!cart || cart.lines.length === 0) {
      throw new OrderServiceError(
        'CART_NOT_CONFIRMED',
        'No confirmed cart found to submit. Please review and confirm your cart.',
      )
    }

    let orderGrossPaise = 0
    let orderDiscountPaise = 0
    let orderTotalPaise = 0
    const snapshotLines: Array<{
      productId: string | null
      sku: string
      productName: string
      paidQty: number
      freeQty: number
      reservedQty: number
      sellingUnit: ProductUnit
      inventoryUnit: ProductUnit
      unitPricePaise: number
      priceBasis: PriceBasis
      grossPaise: number
      discountPaise: number
      totalPaise: number
      schemeKind: SchemeKind | null
      schemeId: string | null
      schemeBuyQty: number | null
      schemeFreeQty: number | null
      schemeMinQty: number | null
      schemeDiscountBps: number | null
    }> = []

    for (const line of cart.lines) {
      const product = line.product
      if (!product || !product.isActive) {
        throw new OrderServiceError(
          'PRODUCT_UNAVAILABLE',
          `Product ${product?.name ?? line.productId} is no longer available`,
        )
      }

      // Safeguard: unconfirmed price basis blocks commercial submission
      if (!isSimulation && product.priceBasis === PriceBasis.UNCONFIRMED) {
        throw new OrderServiceError(
          'PRICE_BASIS_UNCONFIRMED',
          `Cannot place commercial order: SKU ${product.sku} has UNCONFIRMED price basis. Distributor confirmation required.`,
        )
      }

      const activeScheme = product.schemes[0]
      let schemeInput = null
      if (activeScheme) {
        if (activeScheme.kind === 'BUY_X_GET_Y' && activeScheme.buyQty && activeScheme.freeQty) {
          schemeInput = {
            kind: 'BUY_X_GET_Y' as const,
            buyQty: activeScheme.buyQty,
            freeQtyPerMultiple: activeScheme.freeQty,
            sellingUnit: product.sellingUnit,
          }
        } else if (
          activeScheme.kind === 'THRESHOLD_PERCENT' &&
          activeScheme.minQty &&
          activeScheme.discountBps
        ) {
          schemeInput = {
            kind: 'THRESHOLD_PERCENT' as const,
            minQty: activeScheme.minQty,
            discountBps: activeScheme.discountBps,
            sellingUnit: product.sellingUnit,
          }
        }
      }

      const calc = calculateLine({
        quantity: line.quantity,
        unitPricePaise: product.pricePaise,
        priceBasis: product.priceBasis,
        availableStock: product.inventoryQty,
        sellingUnit: product.sellingUnit,
        inventoryUnit: product.inventoryUnit,
        scheme: schemeInput,
      })

      if (calc.stockStatus === 'INSUFFICIENT' || calc.stockStatus === 'OUT_OF_STOCK') {
        throw new OrderServiceError(
          'INSUFFICIENT_STOCK',
          `Insufficient stock for ${product.name} (required: ${calc.requiredStockQty}, available: ${product.inventoryQty})`,
        )
      }

      orderGrossPaise += calc.grossPaise
      orderDiscountPaise += calc.discountPaise
      orderTotalPaise += calc.totalPaise

      snapshotLines.push({
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        paidQty: calc.paidQty,
        freeQty: calc.freeQty,
        reservedQty: calc.requiredStockQty,
        sellingUnit: product.sellingUnit,
        inventoryUnit: product.inventoryUnit,
        unitPricePaise: product.pricePaise,
        priceBasis: product.priceBasis,
        grossPaise: calc.grossPaise,
        discountPaise: calc.discountPaise,
        totalPaise: calc.totalPaise,
        schemeKind: activeScheme?.kind ?? null,
        schemeId: activeScheme?.id ?? null,
        schemeBuyQty: activeScheme?.buyQty ?? null,
        schemeFreeQty: activeScheme?.freeQty ?? null,
        schemeMinQty: activeScheme?.minQty ?? null,
        schemeDiscountBps: activeScheme?.discountBps ?? null,
      })
    }

    const ttlHours = parseInt(process.env.ORDER_RESERVATION_TTL_HOURS || '24', 10)
    const reservationExpiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
    const submittedAt = new Date()

    // Create Order with explicit isSimulation flag
    const createdOrder = await tx.order.create({
      data: {
        retailerId,
        cartId: cart.id,
        idempotencyKey,
        status: OrderStatus.SUBMITTED,
        submittedAt,
        reservationExpiresAt,
        subtotalPaise: orderGrossPaise,
        discountPaise: orderDiscountPaise,
        totalPaise: orderTotalPaise,
        priceBasisConfirmed: !isSimulation,
        isSimulation,
        lines: {
          create: snapshotLines,
        },
      },
      include: {
        lines: { orderBy: { id: 'asc' } },
      },
    })

    // Mark Cart as SUBMITTED
    await tx.cart.update({
      where: { id: cart.id },
      data: {
        status: 'SUBMITTED',
        submittedAt,
      },
    })

    return {
      id: createdOrder.id,
      retailerId: createdOrder.retailerId,
      cartId: createdOrder.cartId,
      idempotencyKey: createdOrder.idempotencyKey,
      status: createdOrder.status,
      submittedAt: createdOrder.submittedAt,
      updatedAt: createdOrder.updatedAt,
      reservationExpiresAt: createdOrder.reservationExpiresAt,
      inventoryReleasedAt: createdOrder.inventoryReleasedAt,
      rejectionReason: createdOrder.rejectionReason,
      reviewedByUserId: createdOrder.reviewedByUserId,
      subtotalPaise: createdOrder.subtotalPaise,
      discountPaise: createdOrder.discountPaise,
      totalPaise: createdOrder.totalPaise,
      priceBasisConfirmed: createdOrder.priceBasisConfirmed,
      isSimulation: createdOrder.isSimulation,
      lines: createdOrder.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        sku: l.sku,
        productName: l.productName,
        paidQty: l.paidQty,
        freeQty: l.freeQty,
        reservedQty: l.reservedQty,
        sellingUnit: l.sellingUnit,
        inventoryUnit: l.inventoryUnit,
        unitPricePaise: l.unitPricePaise,
        priceBasis: l.priceBasis,
        grossPaise: l.grossPaise,
        discountPaise: l.discountPaise,
        totalPaise: l.totalPaise,
        schemeKind: l.schemeKind,
        schemeId: l.schemeId,
      })),
    }
  })
}

/**
 * Returns orders placed by a retailer.
 */
export async function getRetailerOrders(retailerId: string): Promise<OrderView[]> {
  const orders = await prisma.order.findMany({
    where: { retailerId },
    orderBy: { submittedAt: 'desc' },
    include: {
      lines: { orderBy: { id: 'asc' } },
    },
  })

  return orders.map((o) => ({
    id: o.id,
    retailerId: o.retailerId,
    cartId: o.cartId,
    idempotencyKey: o.idempotencyKey,
    status: o.status,
    submittedAt: o.submittedAt,
    updatedAt: o.updatedAt,
    reservationExpiresAt: o.reservationExpiresAt,
    inventoryReleasedAt: o.inventoryReleasedAt,
    rejectionReason: o.rejectionReason,
    reviewedByUserId: o.reviewedByUserId,
    subtotalPaise: o.subtotalPaise,
    discountPaise: o.discountPaise,
    totalPaise: o.totalPaise,
    priceBasisConfirmed: o.priceBasisConfirmed,
    isSimulation: o.isSimulation,
    lines: o.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.sku,
      productName: l.productName,
      paidQty: l.paidQty,
      freeQty: l.freeQty,
      reservedQty: l.reservedQty,
      sellingUnit: l.sellingUnit,
      inventoryUnit: l.inventoryUnit,
      unitPricePaise: l.unitPricePaise,
      priceBasis: l.priceBasis,
      grossPaise: l.grossPaise,
      discountPaise: l.discountPaise,
      totalPaise: l.totalPaise,
      schemeKind: l.schemeKind,
      schemeId: l.schemeId,
    })),
  }))
}

/**
 * Order desk query: List orders with optional filters.
 */
export async function getAllOrders(filter?: {
  status?: OrderStatus
  isSimulation?: boolean
}): Promise<OrderView[]> {
  const whereClause: {
    status?: OrderStatus
    isSimulation?: boolean
  } = {}

  if (filter?.status) whereClause.status = filter.status
  if (filter?.isSimulation !== undefined) whereClause.isSimulation = filter.isSimulation

  const orders = await prisma.order.findMany({
    where: whereClause,
    orderBy: { submittedAt: 'desc' },
    include: {
      retailer: { select: { email: true } },
      lines: { orderBy: { id: 'asc' } },
    },
  })

  return orders.map((o) => ({
    id: o.id,
    retailerId: o.retailerId,
    retailerEmail: o.retailer.email,
    cartId: o.cartId,
    idempotencyKey: o.idempotencyKey,
    status: o.status,
    submittedAt: o.submittedAt,
    updatedAt: o.updatedAt,
    reservationExpiresAt: o.reservationExpiresAt,
    inventoryReleasedAt: o.inventoryReleasedAt,
    rejectionReason: o.rejectionReason,
    reviewedByUserId: o.reviewedByUserId,
    subtotalPaise: o.subtotalPaise,
    discountPaise: o.discountPaise,
    totalPaise: o.totalPaise,
    priceBasisConfirmed: o.priceBasisConfirmed,
    isSimulation: o.isSimulation,
    lines: o.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.sku,
      productName: l.productName,
      paidQty: l.paidQty,
      freeQty: l.freeQty,
      reservedQty: l.reservedQty,
      sellingUnit: l.sellingUnit,
      inventoryUnit: l.inventoryUnit,
      unitPricePaise: l.unitPricePaise,
      priceBasis: l.priceBasis,
      grossPaise: l.grossPaise,
      discountPaise: l.discountPaise,
      totalPaise: l.totalPaise,
      schemeKind: l.schemeKind,
      schemeId: l.schemeId,
    })),
  }))
}

export async function getOrdersForRetailer(retailerId: string): Promise<OrderView[]> {
  const orders = await prisma.order.findMany({
    where: { retailerId },
    include: {
      retailer: { select: { email: true } },
      lines: { orderBy: { id: 'asc' } },
    },
    orderBy: { submittedAt: 'desc' },
  })

  return orders.map((o) => ({
    id: o.id,
    retailerId: o.retailerId,
    retailerEmail: o.retailer.email,
    cartId: o.cartId,
    idempotencyKey: o.idempotencyKey,
    status: o.status,
    submittedAt: o.submittedAt,
    updatedAt: o.updatedAt,
    reservationExpiresAt: o.reservationExpiresAt,
    inventoryReleasedAt: o.inventoryReleasedAt,
    rejectionReason: o.rejectionReason,
    reviewedByUserId: o.reviewedByUserId,
    subtotalPaise: o.subtotalPaise,
    discountPaise: o.discountPaise,
    totalPaise: o.totalPaise,
    priceBasisConfirmed: o.priceBasisConfirmed,
    isSimulation: o.isSimulation,
    lines: o.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.sku,
      productName: l.productName,
      paidQty: l.paidQty,
      freeQty: l.freeQty,
      reservedQty: l.reservedQty,
      sellingUnit: l.sellingUnit,
      inventoryUnit: l.inventoryUnit,
      unitPricePaise: l.unitPricePaise,
      priceBasis: l.priceBasis,
      grossPaise: l.grossPaise,
      discountPaise: l.discountPaise,
      totalPaise: l.totalPaise,
      schemeKind: l.schemeKind,
      schemeId: l.schemeId,
    })),
  }))
}

/**
 * Order desk status update: APPROVE or REJECT.
 * Gated by `isOrderReviewPolicyEnabled()`.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  reviewerUserId: string,
  options?: { rejectionReason?: string },
): Promise<OrderView> {
  if (!isOrderReviewPolicyEnabled()) {
    throw new OrderServiceError(
      'REVIEW_POLICY_DISABLED',
      'Order approval/rejection is disabled: distributor authorization policy is pending configuration.',
    )
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      lines: true,
      retailer: { select: { email: true } },
    },
  })

  if (!order) {
    throw new OrderServiceError('ORDER_NOT_FOUND', 'Order not found')
  }

  if (order.status !== OrderStatus.SUBMITTED) {
    throw new OrderServiceError(
      'INVALID_STATUS_TRANSITION',
      `Order is already ${order.status} and cannot be transitioned to ${newStatus}`,
    )
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: newStatus,
      rejectionReason:
        newStatus === OrderStatus.REJECTED ? (options?.rejectionReason ?? 'Rejected by Order Desk') : null,
      inventoryReleasedAt: newStatus === OrderStatus.REJECTED ? new Date() : null,
      reviewedByUserId: reviewerUserId,
    },
    include: {
      retailer: { select: { email: true } },
      lines: { orderBy: { id: 'asc' } },
    },
  })

  return {
    id: updated.id,
    retailerId: updated.retailerId,
    retailerEmail: updated.retailer.email,
    cartId: updated.cartId,
    idempotencyKey: updated.idempotencyKey,
    status: updated.status,
    submittedAt: updated.submittedAt,
    updatedAt: updated.updatedAt,
    reservationExpiresAt: updated.reservationExpiresAt,
    inventoryReleasedAt: updated.inventoryReleasedAt,
    rejectionReason: updated.rejectionReason,
    reviewedByUserId: updated.reviewedByUserId,
    subtotalPaise: updated.subtotalPaise,
    discountPaise: updated.discountPaise,
    totalPaise: updated.totalPaise,
    priceBasisConfirmed: updated.priceBasisConfirmed,
    isSimulation: updated.isSimulation,
    lines: updated.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.sku,
      productName: l.productName,
      paidQty: l.paidQty,
      freeQty: l.freeQty,
      reservedQty: l.reservedQty,
      sellingUnit: l.sellingUnit,
      inventoryUnit: l.inventoryUnit,
      unitPricePaise: l.unitPricePaise,
      priceBasis: l.priceBasis,
      grossPaise: l.grossPaise,
      discountPaise: l.discountPaise,
      totalPaise: l.totalPaise,
      schemeKind: l.schemeKind,
      schemeId: l.schemeId,
    })),
  }
}
