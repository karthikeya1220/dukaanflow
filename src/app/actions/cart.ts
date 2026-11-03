'use server'

import { z } from 'zod'
import { checkRole } from '@/lib/auth/require-role'
import { prisma } from '@/db'
import {
  addCartProduct as addCartProductForRetailer,
  clearCart as clearCartForRetailer,
  confirmCart as confirmCartForRetailer,
  createNewCart as createNewCartForRetailer,
  getCartForRetailer,
  getSubmittedCartsForRetailer,
  removeCartLine as removeCartLineForRetailer,
  updateCartLine as updateCartLineForRetailer,
  CartServiceError,
  type CartServiceResult,
  type HistoricalCartView,
} from '@/lib/cart-service'

const productInputSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
})
const lineInputSchema = z.object({
  lineId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
})

export type CartActionResult =
  | { ok: true; cart: CartServiceResult['view']; stale: boolean }
  | { ok: false; code: string; message: string }

export type CartHistoryActionResult =
  | { ok: true; carts: HistoricalCartView[] }
  | { ok: false; code: string; message: string }

async function retailerId(): Promise<
  | { ok: true; id: string }
  | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN'; message: string }
> {
  const auth = await checkRole('RETAILER')
  if (!auth.ok) {
    return {
      ok: false,
      code: auth.code,
      message: auth.code === 'FORBIDDEN' ? 'Retailer access required' : 'Authentication required',
    }
  }
  const user = await prisma.user.findUnique({
    where: { authSubject: auth.user.id },
    select: { id: true },
  })
  return user
    ? { ok: true, id: user.id }
    : { ok: false, code: 'UNAUTHORIZED', message: 'Authentication required' }
}

function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof CartServiceError) {
    return { code: error.code, message: error.message }
  }
  return { code: 'INTERNAL_ERROR', message: 'Cart operation failed' }
}

async function run(
  operation: (id: string) => Promise<CartServiceResult>,
): Promise<CartActionResult> {
  const auth = await retailerId()
  if (!auth.ok) return auth
  try {
    const result = await operation(auth.id)
    return { ok: true, cart: result.view, stale: result.stale }
  } catch (error) {
    return { ok: false, ...safeError(error) }
  }
}

export async function getCurrentCart(): Promise<CartActionResult> {
  return run(getCartForRetailer)
}

export async function createNewCart(): Promise<CartActionResult> {
  return run(createNewCartForRetailer)
}

export async function getCartHistory(): Promise<CartHistoryActionResult> {
  const auth = await retailerId()
  if (!auth.ok) return auth
  try {
    return { ok: true, carts: await getSubmittedCartsForRetailer(auth.id) }
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Cart history unavailable' }
  }
}

export async function addCartProduct(input: unknown): Promise<CartActionResult> {
  const parsed = productInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT', message: 'Invalid cart input' }
  return run((id) => addCartProductForRetailer(id, parsed.data.productId, parsed.data.quantity))
}

export async function updateCartLine(input: unknown): Promise<CartActionResult> {
  const parsed = lineInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT', message: 'Invalid cart input' }
  return run((id) => updateCartLineForRetailer(id, parsed.data.lineId, parsed.data.quantity))
}

export async function removeCartLine(input: unknown): Promise<CartActionResult> {
  const parsed = z.object({ lineId: z.string().trim().min(1) }).safeParse(input)
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT', message: 'Invalid cart input' }
  return run((id) => removeCartLineForRetailer(id, parsed.data.lineId))
}

export async function clearCart(): Promise<CartActionResult> {
  return run(clearCartForRetailer)
}

export async function confirmCart(): Promise<CartActionResult> {
  return run(confirmCartForRetailer)
}
