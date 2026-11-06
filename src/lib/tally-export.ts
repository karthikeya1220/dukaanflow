import { OrderView } from '@/lib/order-service'

/**
 * Deterministic Tally-compatible CSV export service.
 *
 * Requirements:
 * - Deterministic output: sorted columns and rows.
 * - Proper escaping for commas, quotes, and newlines.
 * - Historical snapshot fields: Order ID, Date, Retailer Email, SKU, Item Name, Quantity (Paid & Free), Unit Price (Paise & Rupee), Total.
 */

export interface TallyCsvRow {
  orderId: string
  orderDate: string
  retailerEmail: string
  status: string
  sku: string
  itemName: string
  paidQty: number
  freeQty: number
  totalQty: number
  sellingUnit: string
  unitPriceRupees: string
  grossAmountRupees: string
  discountAmountRupees: string
  netAmountRupees: string
}

/**
 * Spreadsheet (Excel / Tally) formula-injection guard: values beginning with
 * =, +, -, @ or a tab can execute as formulae when the CSV is opened in a
 * spreadsheet. Standard mitigation is prefixing a single apostrophe, which
 * spreadsheets treat as literal text.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

function escapeCsvField(val: string | number): string {
  let str = String(val)
  if (FORMULA_PREFIXES.some((prefix) => str.startsWith(prefix))) {
    str = `'${str}`
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function formatRupees(paise: number): string {
  return (paise / 100).toFixed(2)
}

export function generateTallyCsvData(orders: OrderView[]): string {
  const headers = [
    'Order ID',
    'Order Date',
    'Retailer Email',
    'Order Status',
    'SKU',
    'Item Name',
    'Paid Qty',
    'Free Qty',
    'Total Qty',
    'Unit',
    'Unit Price (INR)',
    'Gross (INR)',
    'Discount (INR)',
    'Net Amount (INR)',
  ]

  const rows: string[] = [headers.map(escapeCsvField).join(',')]

  for (const order of orders) {
    const orderDate = new Date(order.submittedAt).toISOString().split('T')[0]
    const retailerEmail = order.retailerEmail ?? 'unknown'

    for (const line of order.lines) {
      const row = [
        order.id,
        orderDate,
        retailerEmail,
        order.status,
        line.sku,
        line.productName,
        line.paidQty,
        line.freeQty,
        line.paidQty + line.freeQty,
        line.sellingUnit,
        formatRupees(line.unitPricePaise),
        formatRupees(line.grossPaise),
        formatRupees(line.discountPaise),
        formatRupees(line.totalPaise),
      ]
      rows.push(row.map(escapeCsvField).join(','))
    }
  }

  return rows.join('\r\n')
}

