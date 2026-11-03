import { describe, expect, it } from 'vitest'
import { generateTallyCsvData, formatRupees } from '@/lib/tally-export'
import type { OrderView } from '@/lib/order-service'

describe('Tally CSV Export', () => {
  it('formats rupees deterministically from integer paise', () => {
    expect(formatRupees(100)).toBe('1.00')
    expect(formatRupees(1250)).toBe('12.50')
    expect(formatRupees(0)).toBe('0.00')
    expect(formatRupees(99)).toBe('0.99')
  })

  it('generates headers and row data correctly with escaping', () => {
    const mockOrder: OrderView = {
      id: 'ord-123',
      retailerId: 'ret-1',
      retailerEmail: 'retailer@example.test',
      cartId: 'cart-1',
      idempotencyKey: 'idemp-1',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-11-03T10:00:00.000Z'),
      updatedAt: new Date('2026-11-03T10:00:00.000Z'),
      reservationExpiresAt: new Date('2026-11-04T10:00:00.000Z'),
      inventoryReleasedAt: null,
      rejectionReason: null,
      subtotalPaise: 2400,
      discountPaise: 200,
      totalPaise: 2200,
      priceBasisConfirmed: true,
      isSimulation: false,
      reviewedByUserId: null,
      lines: [
        {
          id: 'line-1',
          productId: 'prod-1',
          sku: 'SKU-A',
          productName: 'Biscuit, "Crispy & Sweet"',
          paidQty: 2,
          freeQty: 1,
          reservedQty: 3,
          sellingUnit: 'CASE',
          inventoryUnit: 'CASE',
          unitPricePaise: 1200,
          priceBasis: 'PER_CASE',
          grossPaise: 2400,
          discountPaise: 200,
          totalPaise: 2200,
          schemeKind: 'BUY_X_GET_Y',
          schemeId: 'sch-1',
        },
      ],
    }

    const csv = generateTallyCsvData([mockOrder])
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Order ID,Order Date,Retailer Email')
    // Check that quotes and commas are escaped properly
    expect(lines[1]).toContain('"Biscuit, ""Crispy & Sweet"""')
    expect(lines[1]).toContain('ord-123')
    expect(lines[1]).toContain('22.00')
  })
})

