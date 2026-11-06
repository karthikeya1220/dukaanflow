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

/**
 * Deterministic timestamp formatters (IST).
 *
 * Locale-dependent calls like `toLocaleTimeString()` produce different text on
 * the server and the browser (e.g. "07:07 PM" vs "07:07 pm"), which breaks
 * React hydration. These pinned-locale, pinned-timeZone formatters render
 * identical output on both sides so client components can safely format at SSR.
 */
const IST_TIME_ZONE = 'Asia/Kolkata'

export function formatOrderTime(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h12',
  }).format(date)
}

export function formatOrderDateTime(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
  return `${datePart}, ${formatOrderTime(date)} IST`
}
