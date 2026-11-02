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
  return client.cart.findUnique({
    where: { retailerId },
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

async function reopenIfStale(
  tx: TransactionClient,
  cart: NonNullable<Awaited<ReturnType<typeof loadCart>>>,
): Promise<boolean> {
  if (cart.status !== 'CONFIRMED' || !cart.confirmedFingerprint) return false
  const currentFingerprint = fingerprintCartLines(cart.lines)
  if (currentFingerprint === cart.confirmedFingerprint) return false

  const result = await tx.cart.updateMany({
    where: {
      id: cart.id,
      retailerId: cart.retailerId,
      status: 'CONFIRMED',
      confirmedFingerprint: cart.confirmedFingerprint,
    },
    data: {
      status: 'ACTIVE',
      confirmedAt: null,
      confirmedFingerprint: null,
    },
  })
  return result.count === 1
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
    let stale = false
    if (cart) stale = await reopenIfStale(tx, cart)
    const current = stale ? await loadCart(tx, retailerId) : cart
    return buildView(current, retailerId, stale)
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
    const existingCart = await tx.cart.findUnique({
      where: { retailerId },
      select: { status: true },
    })
    const cart = await tx.cart.upsert({
      where: { retailerId },
      create: { retailerId },
      update: {
        status: 'ACTIVE',
        confirmedAt: null,
        confirmedFingerprint: null,
      },
    })
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
      where: { id: lineId, cart: { retailerId } },
      include: { product: true, cart: { select: { status: true } } },
    })
    if (!line) throw new CartServiceError('LINE_NOT_FOUND', 'Cart line not found')
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
      line.cart.status === 'CONFIRMED',
    )
  })
}

export async function removeCartLine(
  retailerId: string,
  lineId: string,
): Promise<ServiceResult> {
  return mutateCart(async (tx) => {
    const line = await tx.cartLine.findFirst({
      where: { id: lineId, cart: { retailerId } },
      select: { id: true, cartId: true, cart: { select: { status: true } } },
    })
    if (!line) {
      return buildView(await loadCart(tx, retailerId), retailerId, false)
    }
    await tx.cart.update({
      where: { id: line.cartId },
      data: { status: 'ACTIVE', confirmedAt: null, confirmedFingerprint: null },
    })
    await tx.cartLine.delete({ where: { id: line.id } })
    return buildView(
      await loadCart(tx, retailerId),
      retailerId,
      line.cart.status === 'CONFIRMED',
    )
  })
}

export async function clearCart(retailerId: string): Promise<ServiceResult> {
  return mutateCart(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { retailerId },
      select: { id: true, status: true },
    })
    if (!cart) return buildView(null, retailerId, false)
    await tx.cartLine.deleteMany({ where: { cartId: cart.id } })
    await tx.cart.update({
      where: { id: cart.id },
      data: { status: 'ACTIVE', confirmedAt: null, confirmedFingerprint: null },
    })
    return buildView(
      await loadCart(tx, retailerId),
      retailerId,
      cart.status === 'CONFIRMED',
    )
  })
}

export async function confirmCart(retailerId: string): Promise<ServiceResult> {
  return mutateCart(async (tx) => {
    const cart = await loadCart(tx, retailerId)
    if (!cart || cart.lines.length === 0) {
      throw new CartServiceError('INVALID_INPUT', 'Cart is empty')
    }
    if (await reopenIfStale(tx, cart)) {
      throw new CartServiceError(
        'STALE_CART',
        'Cart changed since it was last confirmed; review it again',
      )
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
    await tx.cart.update({
      where: { id: cart.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedFingerprint: fingerprint,
      },
    })
    return buildView(await loadCart(tx, retailerId), retailerId, false)
  })
}
