import { z } from 'zod'
import { prisma } from '@/db'
import type { Prisma } from '@/generated/prisma/client'
import type { ProductUnit } from '@/generated/prisma/enums'
export { formatPaise, formatScheme, formatUnit } from '@/lib/catalogue-format'

const catalogueQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  stock: z.enum(['all', 'in-stock', 'out-of-stock']).default('all'),
  scheme: z.enum(['all', 'with-scheme']).default('all'),
  unit: z.enum(['all', 'PIECE', 'PACK', 'CASE']).default('all'),
})

export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>

export function parseCatalogueQuery(
  searchParams: Record<string, string | string[] | undefined>,
): CatalogueQuery {
  const value = (key: string) => {
    const raw = searchParams[key]
    return Array.isArray(raw) ? raw[0] : raw
  }

  return catalogueQuerySchema.parse({
    q: value('q'),
    stock: value('stock'),
    scheme: value('scheme'),
    unit: value('unit'),
  })
}

export function buildCatalogueWhere(
  query: CatalogueQuery,
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { isActive: true }

  if (query.q) {
    where.OR = [
      { sku: { contains: query.q, mode: 'insensitive' } },
      { name: { contains: query.q, mode: 'insensitive' } },
    ]
  }

  if (query.stock === 'in-stock') {
    where.inventoryQty = { gt: 0 }
  } else if (query.stock === 'out-of-stock') {
    where.inventoryQty = 0
  }

  if (query.scheme === 'with-scheme') {
    where.schemes = { some: { isActive: true } }
  }

  if (query.unit !== 'all') {
    where.sellingUnit = query.unit as ProductUnit
  }

  return where
}

export async function getCatalogueProducts(query: CatalogueQuery) {
  return prisma.product.findMany({
    where: buildCatalogueWhere(query),
    include: {
      schemes: {
        where: { isActive: true },
        orderBy: { kind: 'asc' },
      },
    },
    orderBy: [{ name: 'asc' }, { sku: 'asc' }],
  })
}
