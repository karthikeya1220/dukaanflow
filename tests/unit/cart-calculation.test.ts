import { describe, expect, it } from 'vitest'
import {
  calculateCart,
  calculateLine,
  CartCalculationError,
  type CalculationInput,
} from '@/lib/cart-calculation'

const biscuit = (overrides: Partial<CalculationInput> = {}): CalculationInput => ({
  productId: 'biscuit',
  quantity: 20,
  unitPricePaise: 810,
  priceBasis: 'UNCONFIRMED',
  sellingUnit: 'CASE',
  inventoryUnit: 'CASE',
  availableStock: 340,
  scheme: {
    kind: 'BUY_X_GET_Y',
    buyQty: 10,
    freeQtyPerMultiple: 1,
    sellingUnit: 'CASE',
  },
  ...overrides,
})

const detergent = (
  overrides: Partial<CalculationInput> = {},
): CalculationInput => ({
  productId: 'detergent',
  quantity: 5,
  unitPricePaise: 10_150,
  priceBasis: 'UNCONFIRMED',
  sellingUnit: 'CASE',
  inventoryUnit: 'CASE',
  availableStock: 85,
  scheme: {
    kind: 'THRESHOLD_PERCENT',
    minQty: 5,
    discountBps: 300,
    sellingUnit: 'CASE',
  },
  ...overrides,
})

describe('calculateLine', () => {
  it('calculates complete BUY_X_GET_Y multiples and required stock', () => {
    expect(calculateLine(biscuit())).toMatchObject({
      paidQty: 20,
      freeQty: 2,
      requiredStockQty: 22,
      grossPaise: 16_200,
      discountPaise: 0,
      totalPaise: 16_200,
      qualifiedScheme: true,
      stockStatus: 'AVAILABLE',
      warning: 'PRICE_BASIS_UNCONFIRMED',
    })
  })

  it('does not award a partial buy multiple', () => {
    expect(calculateLine(biscuit({ quantity: 19 }))).toMatchObject({
      freeQty: 1,
      requiredStockQty: 20,
      qualifiedScheme: true,
    })
  })

  it('calculates the supplied biscuit fixture without pack multiplication', () => {
    expect(calculateLine(biscuit({ quantity: 15 }))).toMatchObject({
      unitPricePaise: 810,
      grossPaise: 12_150,
      totalPaise: 12_150,
    })
  })

  it('calculates threshold discount with floor rounding', () => {
    expect(calculateLine(detergent())).toMatchObject({
      grossPaise: 50_750,
      discountPaise: 1_522,
      totalPaise: 49_228,
      freeQty: 0,
      qualifiedScheme: true,
    })
  })

  it('does not qualify threshold discount below the minimum paid quantity', () => {
    expect(calculateLine(detergent({ quantity: 4 }))).toMatchObject({
      grossPaise: 40_600,
      discountPaise: 0,
      totalPaise: 40_600,
      qualifiedScheme: false,
    })
  })

  it('handles the zero-stock tea fixture without changing requested quantity', () => {
    expect(
      calculateLine({
        productId: 'tea',
        quantity: 1,
        unitPricePaise: 11_800,
        priceBasis: 'UNCONFIRMED',
        sellingUnit: 'CASE',
        inventoryUnit: 'CASE',
        availableStock: 0,
        scheme: null,
      }),
    ).toMatchObject({
      paidQty: 1,
      freeQty: 0,
      requiredStockQty: 1,
      totalPaise: 11_800,
      stockStatus: 'OUT_OF_STOCK',
      warnings: ['PRICE_BASIS_UNCONFIRMED', 'INSUFFICIENT_STOCK'],
    })
  })

  it('retains the calculated benefit when free stock is insufficient', () => {
    expect(calculateLine(biscuit({ quantity: 20, availableStock: 21 }))).toMatchObject({
      paidQty: 20,
      freeQty: 2,
      requiredStockQty: 22,
      stockStatus: 'INSUFFICIENT',
      warnings: ['PRICE_BASIS_UNCONFIRMED', 'INSUFFICIENT_STOCK'],
    })
  })

  it('rejects incompatible inventory and selling units', () => {
    expect(() =>
      calculateLine(biscuit({ sellingUnit: 'CASE', inventoryUnit: 'PACK' })),
    ).toThrowError(CartCalculationError)
    expect(() =>
      calculateLine(biscuit({ sellingUnit: 'CASE', inventoryUnit: 'PACK' })),
    ).toThrow(/must match selling unit/)
  })

  it('rejects invalid quantities, prices, stock, and price bases', () => {
    for (const overrides of [
      { quantity: 0 },
      { quantity: 1.5 },
      { unitPricePaise: -1 },
      { availableStock: -1 },
      { priceBasis: 'UNKNOWN' as CalculationInput['priceBasis'] },
    ]) {
      expect(() => calculateLine(biscuit(overrides))).toThrow(CartCalculationError)
    }
  })

  it('rejects invalid scheme parameters and unsupported scheme kinds', () => {
    expect(() =>
      calculateLine(
        biscuit({
          scheme: {
            kind: 'BUY_X_GET_Y',
            buyQty: 0,
            freeQtyPerMultiple: 1,
            sellingUnit: 'CASE',
          },
        }),
      ),
    ).toThrow(/buyQty/)

    expect(() =>
      calculateLine(
        detergent({
          scheme: {
            kind: 'THRESHOLD_PERCENT',
            minQty: 5,
            discountBps: 10_001,
            sellingUnit: 'CASE',
          },
        }),
      ),
    ).toThrow(/discountBps/)

    expect(() =>
      calculateLine(
        biscuit({
          scheme: {
            kind: 'UNSUPPORTED' as never,
            buyQty: 1,
            freeQtyPerMultiple: 1,
            sellingUnit: 'CASE',
          },
        }),
      ),
    ).toThrow(/Scheme kind is not supported/)

    expect(() =>
      calculateLine(
        biscuit({
          scheme: {
            kind: 'BUY_X_GET_Y',
            buyQty: 10,
            freeQtyPerMultiple: 1,
            sellingUnit: 'PACK',
          },
        }),
      ),
    ).toThrow(/Scheme selling unit/)
  })

  it('rejects ambiguous multiple schemes', () => {
    expect(() =>
      calculateLine(
        biscuit({
          scheme: [
            {
              kind: 'BUY_X_GET_Y',
              buyQty: 10,
              freeQtyPerMultiple: 1,
              sellingUnit: 'CASE',
            },
            {
              kind: 'THRESHOLD_PERCENT',
              minQty: 5,
              discountBps: 300,
              sellingUnit: 'CASE',
            },
          ],
        }),
      ),
    ).toThrowError(CartCalculationError)
  })
})

describe('calculateCart', () => {
  it('returns deterministic sorted lines and aggregate integer-paise totals', () => {
    const result = calculateCart([
      detergent({ productId: '02' }),
      biscuit({ productId: '01' }),
    ])

    expect(result.lines.map((line) => line.unitPricePaise)).toEqual([810, 10_150])
    expect(result.grossPaise).toBe(66_950)
    expect(result.discountPaise).toBe(1_522)
    expect(result.totalPaise).toBe(65_428)
    expect(result.requiredStockQty).toBe(27)
    expect(result.hasUnconfirmedPriceBasis).toBe(true)
    expect(result.hasInsufficientStock).toBe(false)
  })

  it('returns an empty deterministic cart', () => {
    expect(calculateCart([])).toEqual({
      lines: [],
      grossPaise: 0,
      discountPaise: 0,
      totalPaise: 0,
      requiredStockQty: 0,
      hasInsufficientStock: false,
      hasUnconfirmedPriceBasis: false,
    })
  })
})
