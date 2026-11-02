import type { ProductUnit } from '@/generated/prisma/enums'

export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`
}

export function formatUnit(unit: ProductUnit): string {
  return unit.toLowerCase()
}

export function formatScheme(scheme: {
  kind: 'BUY_X_GET_Y' | 'THRESHOLD_PERCENT'
  buyQty: number | null
  freeQty: number | null
  minQty: number | null
  discountBps: number | null
}, sellingUnit: ProductUnit): string {
  if (scheme.kind === 'BUY_X_GET_Y') {
    return `Buy ${scheme.buyQty} ${formatUnit(sellingUnit)} and get ${scheme.freeQty} free`
  }

  const percent = ((scheme.discountBps ?? 0) / 100).toFixed(2)
  return `${percent}% off from ${scheme.minQty} ${formatUnit(sellingUnit)}`
}
