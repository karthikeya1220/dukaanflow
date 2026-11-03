'use server'

import { z } from 'zod'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import {
  parseNaturalLanguageOrder,
  type AiOrderExtractionResult,
} from '@/lib/ai-order-parser'
import { addCartProduct } from '@/lib/cart-service'

const aiParseSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty'),
})

const applyItemsSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().positive(),
    }),
  ),
})

export type AiParseActionResult =
  | { ok: true; extraction: AiOrderExtractionResult }
  | { ok: false; code: string; message: string }

export type AiApplyActionResult =
  | { ok: true; addedCount: number }
  | { ok: false; code: string; message: string }

export async function parseAiOrderText(input: unknown): Promise<AiParseActionResult> {
  const user = await getCurrentUserWithRole()
  if (!user || user.role !== 'RETAILER') {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Sign in as a retailer to use AI order capture' }
  }

  const parsed = aiParseSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Please provide valid order text' }
  }

  const dbUser = await prisma.user.findUnique({
    where: { authSubject: user.user.id },
    select: { id: true },
  })
  if (!dbUser) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Retailer account not found' }
  }

  try {
    const extraction = await parseNaturalLanguageOrder(dbUser.id, parsed.data.text)
    return { ok: true, extraction }
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Failed to parse order text' }
  }
}

export async function applyAiItemsToCart(input: unknown): Promise<AiApplyActionResult> {
  const user = await getCurrentUserWithRole()
  if (!user || user.role !== 'RETAILER') {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Sign in as a retailer to add items to cart' }
  }

  const parsed = applyItemsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Invalid items selection' }
  }

  const dbUser = await prisma.user.findUnique({
    where: { authSubject: user.user.id },
    select: { id: true },
  })
  if (!dbUser) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Retailer account not found' }
  }

  try {
    let addedCount = 0
    for (const item of parsed.data.items) {
      await addCartProduct(dbUser.id, item.productId, item.quantity)
      addedCount += 1
    }
    return { ok: true, addedCount }
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Failed to add items to cart' }
  }
}

