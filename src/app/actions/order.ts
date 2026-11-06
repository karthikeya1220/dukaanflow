'use server'

import { z } from 'zod'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import {
  submitCartToOrder,
  getRetailerOrders,
  getAllOrders,
  updateOrderStatus,
  OrderServiceError,
  type OrderView,
} from '@/lib/order-service'
import { OrderStatus } from '@/generated/prisma/enums'

const submitOrderSchema = z.object({
  idempotencyKey: z.string().min(1, 'Idempotency key required'),
  // NOTE: no `isSimulation` field — simulation status is decided server-side
  // by which authorized server action is invoked, never by request parameters.
})

const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1, 'Order ID required'),
  status: z.enum(['APPROVED', 'REJECTED'] as const),
  rejectionReason: z.string().optional(),
})

export type OrderActionResult =
  | { ok: true; order: OrderView }
  | { ok: false; code: string; message: string }

export type OrderListActionResult =
  | { ok: true; orders: OrderView[] }
  | { ok: false; code: string; message: string }

/**
 * Commercial order submission. Server actions alone decide simulation status:
 * this path always submits a commercial order (isSimulation=false on the
 * server), so a manipulated request can never mark itself as a simulation to
 * bypass commercial policy gates.
 */
export async function submitOrder(input: unknown): Promise<OrderActionResult> {
  return performRetailerSubmission(input, { isSimulation: false })
}

/**
 * Simulation (demo) order submission. Only retailers, only this action —
 * iSimulation=true is forced server-side.
 */
export async function submitSimulationOrder(input: unknown): Promise<OrderActionResult> {
  return performRetailerSubmission(input, { isSimulation: true })
}

async function performRetailerSubmission(
  input: unknown,
  forced: { isSimulation: boolean },
): Promise<OrderActionResult> {
  const user = await getCurrentUserWithRole()
  if (!user) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Sign in to submit an order' }
  }
  if (user.role !== 'RETAILER') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only retailers can submit orders' }
  }

  const parsed = submitOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Invalid order submission payload' }
  }

  const dbUser = await prisma.user.findUnique({
    where: { authSubject: user.user.id },
    select: { id: true },
  })
  if (!dbUser) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Retailer account not found' }
  }

  try {
    const order = await submitCartToOrder(dbUser.id, {
      idempotencyKey: parsed.data.idempotencyKey,
      // Server-decided; not influenced by any request field.
      isSimulation: forced.isSimulation,
    })
    return { ok: true, order }
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return { ok: false, code: error.code, message: error.message }
    }
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Order submission failed' }
  }
}

export async function getMyOrders(): Promise<OrderListActionResult> {
  const user = await getCurrentUserWithRole()
  if (!user) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Sign in to view orders' }
  }
  if (user.role !== 'RETAILER') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only retailers can view personal orders' }
  }

  const dbUser = await prisma.user.findUnique({
    where: { authSubject: user.user.id },
    select: { id: true },
  })
  if (!dbUser) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Retailer account not found' }
  }

  try {
    const orders = await getRetailerOrders(dbUser.id)
    return { ok: true, orders }
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Failed to retrieve orders' }
  }
}

export async function getOrderDeskOrders(filter?: {
  status?: OrderStatus
  isSimulation?: boolean
}): Promise<OrderListActionResult> {
  const user = await getCurrentUserWithRole()
  if (!user) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Sign in to access order desk' }
  }
  if (user.role !== 'ORDER_DESK') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only ORDER_DESK staff can access all orders' }
  }

  try {
    const orders = await getAllOrders(filter)
    return { ok: true, orders }
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Failed to fetch order desk queue' }
  }
}

export async function reviewOrder(input: unknown): Promise<OrderActionResult> {
  const user = await getCurrentUserWithRole()
  if (!user) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Sign in to review orders' }
  }
  if (user.role !== 'ORDER_DESK') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only ORDER_DESK staff can approve or reject orders' }
  }

  const dbUser = await prisma.user.findUnique({
    where: { authSubject: user.user.id },
    select: { id: true },
  })
  if (!dbUser) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Reviewer staff record not found' }
  }

  const parsed = updateOrderStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Invalid review action payload' }
  }

  try {
    const order = await updateOrderStatus(
      parsed.data.orderId,
      parsed.data.status as OrderStatus,
      dbUser.id,
      {
        rejectionReason: parsed.data.rejectionReason,
      },
    )
    return { ok: true, order }
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return { ok: false, code: error.code, message: error.message }
    }
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Order review action failed' }
  }
}
