import { describe, expect, it } from 'vitest'
import {
  buildCatalogueWhere,
  formatPaise,
  formatScheme,
  parseCatalogueQuery,
} from '@/lib/catalogue'

describe('catalogue query parsing', () => {
  it('uses safe defaults', () => {
    expect(parseCatalogueQuery({})).toEqual({
      q: '',
      stock: 'all',
      scheme: 'all',
      unit: 'all',
    })
  })

  it('parses search and filters', () => {
    const query = parseCatalogueQuery({
      q: 'SKU-BS-075',
      stock: 'in-stock',
      scheme: 'with-scheme',
      unit: 'CASE',
    })

    expect(query).toEqual({
      q: 'SKU-BS-075',
      stock: 'in-stock',
      scheme: 'with-scheme',
      unit: 'CASE',
    })
  })
})

describe('catalogue filters', () => {
  it('always limits results to active products', () => {
    expect(buildCatalogueWhere(parseCatalogueQuery({}))).toEqual({
      isActive: true,
    })
  })

  it('builds case-insensitive search and stock/scheme filters', () => {
    expect(
      buildCatalogueWhere(
        parseCatalogueQuery({
          q: 'biscuit',
          stock: 'in-stock',
          scheme: 'with-scheme',
          unit: 'CASE',
        }),
      ),
    ).toEqual({
      isActive: true,
      OR: [
        { sku: { contains: 'biscuit', mode: 'insensitive' } },
        { name: { contains: 'biscuit', mode: 'insensitive' } },
      ],
      inventoryQty: { gt: 0 },
      schemes: { some: { isActive: true } },
      sellingUnit: 'CASE',
    })
  })
})

describe('catalogue display formatting', () => {
  it('formats integer paise without pack-size multiplication', () => {
    expect(formatPaise(810)).toBe('₹8.10')
    expect(formatPaise(10150)).toBe('₹101.50')
    expect(formatPaise(11800)).toBe('₹118.00')
  })

  it('formats the supported scheme types in selling units', () => {
    expect(
      formatScheme({
        kind: 'BUY_X_GET_Y',
        buyQty: 10,
        freeQty: 1,
        minQty: null,
        discountBps: null,
      }, 'CASE'),
    ).toBe('Buy 10 case and get 1 free')

    expect(
      formatScheme({
        kind: 'THRESHOLD_PERCENT',
        buyQty: null,
        freeQty: null,
        minQty: 5,
        discountBps: 300,
      }, 'CASE'),
    ).toBe('3.00% off from 5 case')
  })
})
