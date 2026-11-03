import { createHash } from 'node:crypto'
import { prisma } from '@/db'
import {
  calculateCart,
  calculateLine,
  CartCalculationError,
  type CalculationInput,
  type CalculationResult,
  type ProductUnit,
  type PriceBasis,
} from '@/lib/cart-calculation'
import type { Prisma } from '@/generated/prisma/client'

type DbClient = typeof prisma
type TransactionClient = Prisma.TransactionClient

export type CartServiceErrorCode =
  | 'INVALID_INPUT'
  | 'PRODUCT_UNAVAILABLE'
  | 'LINE_NOT_FOUND'
  | 'CART_NOT_ACTIVE'
  | 'CART_ALREADY_SUBMITTED'
  | 'STALE_CART'
  | 'CONFLICT'
  | 'CALCULATION_ERROR'
  | 'INTERNAL_ERROR'

export class CartServiceError extends Error {
  readonly code: CartServiceErrorCode

  constructor(code: CartServiceErrorCode, message: string) {
    super(message)
    this.name = 'CartServiceError'
    this.code = code
  }
}

type ProductWithSchemes = Prisma.ProductGetPayload<{
  include: { schemes: { where: { isActive: true } } }
}>

type CartWithLines = Prisma.CartGetPayload<{
  include: {
    lines: {
      include: {
        product: {
          include: { schemes: { where: { isActive: true } } }
        }
      }
    }
  }
}>

export type CartViewLine = {
  id: string
  productId: string
  quantity: number
  product: {
    sku: string
    name: string
    description: string | null
    isActive: boolean
    pricePaise: number
    priceBasis: PriceBasis
    packSize: number
    packUnit: ProductUnit
    sellingUnit: ProductUnit
    inventoryQty: number
    inventoryUnit: ProductUnit
    schemes: ProductWithSchemes['schemes']
  } | null
  calculation: CalculationResult | null
  unavailable: boolean
}

export type CartView = {
  id: string | null
  retailerId: string
  status: 'ACTIVE' | 'CONFIRMED'
  confirmedAt: Date | null
  confirmedFingerprint: string | null
  lines: CartViewLine[]
  calculation: ReturnType<typeof calculateCart>
  stale: boolean
}

type ServiceResult = {
  view: CartView
  stale: boolean
}

export type CartServiceResult = ServiceResult

export type HistoricalCartView = {
  id: string
  retailerId: string
  status: 'SUBMITTED'
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  lines: Array<{
    id: string
    productId: string
    quantity: number
  }>
  order: {
    id: string
    retailerId: string
    status: 'SUBMITTED' | 'APPROVED' | 'REJECTED'
    submittedAt: Date
    reservationExpiresAt: Date
    subtotalPaise: number
    discountPaise: number
    totalPaise: number
    lines: Array<{
      id: string
      productId: string | null
      sku: string
      productName: string
      paidQty: number
      freeQty: number
      reservedQty: number
      unitPricePaise: number
      priceBasis: PriceBasis
      grossPaise: number
      discountPaise: number
      totalPaise: number
    }>
  } | null
}

function mapScheme(
  scheme: ProductWithSchemes['schemes'][number],
  sellingUnit: ProductUnit,
) {
  if (scheme.kind === 'BUY_X_GET_Y') {
    return {
      kind: 'BUY_X_GET_Y' as const,
      buyQty: scheme.buyQty ?? 0,
      freeQtyPerMultiple: scheme.freeQty ?? 0,
      sellingUnit,
    }
  }
  return {
    kind: 'THRESHOLD_PERCENT' as const,
    minQty: scheme.minQty ?? 0,
    discountBps: scheme.discountBps ?? 0,
    sellingUnit,
  }
}

function toCalculationInput(
  quantity: number,
  product: ProductWithSchemes,
): CalculationInput {
  const [scheme, ...ambiguous] = product.schemes
  return {
    quantity,
    unitPricePaise: product.pricePaise,
    priceBasis: product.priceBasis,
    sellingUnit: product.sellingUnit,
    inventoryUnit: product.inventoryUnit,
    availableStock: product.inventoryQty,
    scheme: ambiguous.length > 0
      ? product.schemes.map((item) => mapScheme(item, product.sellingUnit))
      : scheme
        ? mapScheme(scheme, product.sellingUnit)
        : null,
  }
}

function calculationForLine(line: CartWithLines['lines'][number]): CalculationResult {
  if (!line.product) {
    throw new CartServiceError('PRODUCT_UNAVAILABLE', 'A cart product is unavailable')
  }
  try {
    return calculateLine(toCalculationInput(line.quantity, line.product))
  } catch (error) {
    if (error instanceof CartCalculationError) {
      throw new CartServiceError('CALCULATION_ERROR', error.message)
    }
    throw error
  }
}

function canonicalLine(line: CartWithLines['lines'][number]) {
  const product = line.product
  return {
    productId: line.productId,
    sku: product?.sku ?? null,
    quantity: line.quantity,
    pricePaise: product?.pricePaise ?? null,
    priceBasis: product?.priceBasis ?? null,
    packSize: product?.packSize ?? null,
    packUnit: product?.packUnit ?? null,
    sellingUnit: product?.sellingUnit ?? null,
    inventoryQty: product?.inventoryQty ?? null,
    inventoryUnit: product?.inventoryUnit ?? null,
    productIsActive: product?.isActive ?? null,
    schemes: (product?.schemes ?? []).map((scheme) => ({
      id: scheme.id,
      kind: scheme.kind,
      buyQty: scheme.buyQty,
      freeQty: scheme.freeQty,
      minQty: scheme.minQty,
      discountBps: scheme.discountBps,
      isActive: scheme.isActive,
    })).sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
  }
}

export function fingerprintCartLines(lines: CartWithLines['lines']): string {
  const canonical = lines
    .map(canonicalLine)
    .sort((a, b) => a.productId.localeCompare(b.productId))
  return createHash('sha256')
    .update(JSON.stringify({ lines: canonical }), 'utf8')
    .digest('hex')
}

function emptyCalculation() {
  return calculateCart([])
}

function buildView(
  cart: CartWithLines | null,
  retailerId: string,
  stale: boolean,
): ServiceResult {
  if (!cart) {
    return {
      stale,
      view: {
        id: null,
        retailerId,
        status: 'ACTIVE',
        confirmedAt: null,
        confirmedFingerprint: null,
        lines: [],
        calculation: emptyCalculation(),
        stale,
      },
    }
  }
  if (cart.status === 'SUBMITTED') {
    throw new CartServiceError('CART_ALREADY_SUBMITTED', 'Submitted carts are not current carts')
  }

  const lines: CartViewLine[] = cart.lines.map((line) => {
    if (!line.product) {
      return {
        id: line.id,
        productId: line.productId,
        quantity: line.quantity,
        product: null,
        calculation: null,
        unavailable: true,
      }
    }
    return {
      id: line.id,
      productId: line.productId,
      quantity: line.quantity,
      product: line.product,
      calculation: calculationForLine(line),
      unavailable: !line.product.isActive,
    }
  })

  const calculationInputs = cart.lines
    .filter((line) => line.product?.isActive)
    .map((line) => toCalculationInput(line.quantity, line.product!))
  let calculation
  try {
    calculation = calculateCart(calculationInputs)
  } catch (error) {
    if (error instanceof CartCalculationError) {
      throw new CartServiceError('CALCULATION_ERROR', error.message)
    }
    throw error
  }

  return {
    stale,
    view: {
      id: cart.id,
      retailerId,
      status: cart.status,
      confirmedAt: cart.confirmedAt,
      confirmedFingerprint: cart.confirmedFingerprint,
      lines,
      calculation,
      stale,
    },
  }
}

async function loadCart(client: DbClient | TransactionClient, retailerId: string) {
  return client.cart.findFirst({
    where: {
      retailerId,
      status: 'ACTIVE',
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      lines: {
        orderBy: { productId: 'asc' },
        include: {
          product: {
            include: {
              schemes: { where: { isActive: true } },
            },
          },
        },
      },
    },
  })
}

async function loadOwnedCartStatus(
  client: DbClient | TransactionClient,
  retailerId: string,
) {
  return (
    await client.cart.findFirst({
      where: { retailerId, status: 'SUBMITTED' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true },
    })
  ) ?? client.cart.findFirst({
    where: { retailerId, status: 'CONFIRMED' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true },
  })
}

function rejectNonActiveCart(status: 'ACTIVE' | 'CONFIRMED' | 'SUBMITTED'): never {
  if (status === 'SUBMITTED') {
    throw new CartServiceError('CART_ALREADY_SUBMITTED', 'Submitted carts cannot be modified')
  }
  throw new CartServiceError('CART_NOT_ACTIVE', 'Cart is not active')
}

async function mutateCart<T>(
  operation: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(operation)
    } catch (error) {
      if (error instanceof CartServiceError) throw error
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002' &&
        attempt === 0
      ) {
        continue
      }
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new CartServiceError('CONFLICT', 'Cart update conflicted with another change')
      }
      throw new CartServiceError('INTERNAL_ERROR', 'Cart operation failed')
    }
  }
  throw new CartServiceError('CONFLICT', 'Cart update conflicted with another change')
}

export async function getCartForRetailer(retailerId: string): Promise<ServiceResult> {
  return prisma.$transaction(async (tx) => {
    const cart = await loadCart(tx, retailerId)
    return buildView(cart, retailerId, false)
  })
}

export async function addCartProduct(
  retailerId: string,
  productId: string,
  quantity: number,
): Promise<ServiceResult> {
  return mutateCart(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { schemes: { where: { isActive: true } } },
    })
    if (!product || !product.isActive) {
      throw new CartServiceError('PRODUCT_UNAVAILABLE', 'Product is unavailable')
    }
    const existingCart = await loadCart(tx, retailerId)
    const cart = existingCart
      ? await tx.cart.update({
          where: { id: existingCart.id },
          data: {
            status: 'ACTIVE',
            confirmedAt: null,
            confirmedFingerprint: null,
          },
        })
      : await tx.cart.create({ data: { retailerId, status: 'ACTIVE' } })
    await tx.cartLine.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity: { increment: quantity } },
    })
    return buildView(
      await loadCart(tx, retailerId),
      retailerId,
      existingCart?.status === 'CONFIRMED',
    )
  })
}

export async function updateCartLine(
  retailerId: string,
  lineId: string,
  quantity: number,
): Promise<ServiceResult> {
  return mutateCart(async (tx) => {
    const line = await tx.cartLine.findFirst({
      where: {
        id: lineId,
        cart: { retailerId },
      },
      include: { product: true, cart: { select: { status: true } } },
    })
    if (!line) throw new CartServiceError('LINE_NOT_FOUND', 'Cart line not found')
    if (line.cart.status !== 'ACTIVE') rejectNonActiveCart(line.cart.status)
    if (!line.product.isActive) {
      throw new CartServiceError('PRODUCT_UNAVAILABLE', 'Product is unavailable')
    }
    await tx.cart.update({
      where: { id: line.cartId },
      data: { status: 'ACTIVE', confirmedAt: null, confirmedFingerprint: null },
    })
    await tx.cartLine.update({
      where: { id: lineId },
      data: { quantity },
    })
    return buildView(
      await loadCart(tx, retailerId),
      retailerId,
      false,
    )
  })
}

export async function removeCartLine(
  retailerId: string,
  lineId: string,
): Promise<ServiceResult> {
  return mutateCart(async (tx) => {
    const line = await tx.cartLine.findFirst({
      where: {
        id: lineId,
        cart: { retailerId },
      },
      select: { id: true, cartId: true, cart: { select: { status: true } } },
    })
    if (!line) {
      return buildView(await loadCart(tx, retailerId), retailerId, false)
    }
    if (line.cart.status !== 'ACTIVE') rejectNonActiveCart(line.cart.status)
    await tx.cart.update({
      where: { id: line.cartId },
      data: { status: 'ACTIVE', confirmedAt: null, confirmedFingerprint: null },
    })
    await tx.cartLine.delete({ where: { id: line.id } })
    return buildView(
      await loadCart(tx, retailerId),
      retailerId,
      false,
    )
  })
}

export async function clearCart(retailerId: string): Promise<ServiceResult> {
  return mutateCart(async (tx) => {
    const cart = await loadCart(tx, retailerId);
    if (!cart) {
      const ownedStatus = await loadOwnedCartStatus(tx, retailerId)
      if (ownedStatus) rejectNonActiveCart(ownedStatus.status)
      return buildView(null, retailerId, false)
    }
    await tx.cartLine.deleteMany({ where: { cartId: cart.id } })
    await tx.cart.update({
      where: { id: cart.id },
      data: { status: 'ACTIVE', confirmedAt: null, confirmedFingerprint: null },
    })
    return buildView(
      await loadCart(tx, retailerId),
      retailerId,
      false,
    )
  })
}

export async function createNewCart(retailerId: string): Promise<ServiceResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await loadCart(tx, retailerId)
        if (existing) return buildView(existing, retailerId, false)

        await tx.cart.create({ data: { retailerId, status: 'ACTIVE' } })
        const created = await loadCart(tx, retailerId)
        if (!created) {
          throw new CartServiceError('INTERNAL_ERROR', 'Cart could not be created')
        }
        return buildView(created, retailerId, false)
      })
    } catch (error) {
      if (error instanceof CartServiceError) throw error
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002' &&
        attempt === 0
      ) {
        continue
      }
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new CartServiceError('CONFLICT', 'Cart creation conflicted with another change')
      }
      throw new CartServiceError('INTERNAL_ERROR', 'Cart creation failed')
    }
  }
  throw new CartServiceError('CONFLICT', 'Cart creation conflicted with another change')
}

export async function getSubmittedCartsForRetailer(
  retailerId: string,
): Promise<HistoricalCartView[]> {
  const carts = await prisma.cart.findMany({
    where: { retailerId, status: 'SUBMITTED' },
    orderBy: { submittedAt: 'desc' },
    include: {
      lines: {
        orderBy: { productId: 'asc' },
        select: { id: true, productId: true, quantity: true },
      },
    },
  })

  const orders = await prisma.order.findMany({
    where: {
      retailerId,
      cartId: { in: carts.map((cart) => cart.id) },
    },
    include: {
      lines: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          productId: true,
          sku: true,
          productName: true,
          paidQty: true,
          freeQty: true,
          reservedQty: true,
          unitPricePaise: true,
          priceBasis: true,
          grossPaise: true,
          discountPaise: true,
          totalPaise: true,
        },
      },
    },
  })
  const ordersByCartId = new Map(orders.map((order) => [order.cartId, order]))

  return carts.map((cart) => ({
    id: cart.id,
    retailerId: cart.retailerId,
    status: 'SUBMITTED',
    submittedAt: cart.submittedAt,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
    lines: cart.lines,
    order: ordersByCartId.get(cart.id)
      ? {
          id: ordersByCartId.get(cart.id)!.id,
          retailerId: ordersByCartId.get(cart.id)!.retailerId,
          status: ordersByCartId.get(cart.id)!.status,
          submittedAt: ordersByCartId.get(cart.id)!.submittedAt,
          reservationExpiresAt: ordersByCartId.get(cart.id)!.reservationExpiresAt,
          subtotalPaise: ordersByCartId.get(cart.id)!.subtotalPaise,
          discountPaise: ordersByCartId.get(cart.id)!.discountPaise,
          totalPaise: ordersByCartId.get(cart.id)!.totalPaise,
          lines: ordersByCartId.get(cart.id)!.lines,
        }
      : null,
  }))
}

export async function confirmCart(retailerId: string): Promise<ServiceResult> {
  return mutateCart(async (tx) => {
    const cart = await loadCart(tx, retailerId)
    if (!cart || cart.lines.length === 0) {
      const ownedStatus = await loadOwnedCartStatus(tx, retailerId)
      if (ownedStatus) rejectNonActiveCart(ownedStatus.status)
      throw new CartServiceError('INVALID_INPUT', 'Cart is empty')
    }
    const built = buildView(cart, retailerId, false)
    const invalid = built.view.lines.some(
      (line) =>
        line.unavailable ||
        !line.calculation ||
        line.calculation.stockStatus !== 'AVAILABLE',
    )
    if (invalid) {
      throw new CartServiceError('STALE_CART', 'Cart contains unavailable or insufficient stock')
    }
    const fingerprint = fingerprintCartLines(cart.lines)
    const confirmedAt = new Date()
    await tx.cart.update({
      where: { id: cart.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt,
        confirmedFingerprint: fingerprint,
      },
    })
    return buildView(
      {
        ...cart,
        status: 'CONFIRMED',
        confirmedAt,
        confirmedFingerprint: fingerprint,
      },
      retailerId,
      false,
    )
  })
}
