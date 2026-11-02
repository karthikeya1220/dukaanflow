export const PRODUCT_UNITS = ['PIECE', 'PACK', 'CASE'] as const
export const PRICE_BASES = ['UNCONFIRMED', 'PER_PACK', 'PER_CASE'] as const

export type ProductUnit = (typeof PRODUCT_UNITS)[number]
export type PriceBasis = (typeof PRICE_BASES)[number]

export type BuyXGetYScheme = {
  kind: 'BUY_X_GET_Y'
  buyQty: number
  freeQtyPerMultiple: number
  sellingUnit: ProductUnit
}

export type ThresholdPercentScheme = {
  kind: 'THRESHOLD_PERCENT'
  minQty: number
  discountBps: number
  sellingUnit: ProductUnit
}

export type CalculationScheme = BuyXGetYScheme | ThresholdPercentScheme
export type SchemeInput = CalculationScheme | readonly CalculationScheme[] | null

export type CalculationInput = {
  quantity: number
  unitPricePaise: number
  priceBasis: PriceBasis
  sellingUnit: ProductUnit
  inventoryUnit: ProductUnit
  availableStock: number
  scheme: SchemeInput
  lineId?: string
  productId?: string
  sku?: string
}

export type StockStatus = 'AVAILABLE' | 'INSUFFICIENT' | 'OUT_OF_STOCK'
export type CalculationWarning =
  | 'PRICE_BASIS_UNCONFIRMED'
  | 'INSUFFICIENT_STOCK'

export type CalculationResult = {
  paidQty: number
  freeQty: number
  requiredStockQty: number
  unitPricePaise: number
  priceBasis: PriceBasis
  grossPaise: number
  discountPaise: number
  totalPaise: number
  qualifiedScheme: boolean
  stockStatus: StockStatus
  warning?: CalculationWarning
  warnings: readonly CalculationWarning[]
}

export type CartCalculationResult = {
  lines: readonly CalculationResult[]
  grossPaise: number
  discountPaise: number
  totalPaise: number
  requiredStockQty: number
  hasInsufficientStock: boolean
  hasUnconfirmedPriceBasis: boolean
}

export type CalculationErrorCode =
  | 'INVALID_INPUT'
  | 'INCOMPATIBLE_UNITS'
  | 'INVALID_SCHEME'
  | 'AMBIGUOUS_SCHEMES'

export class CartCalculationError extends Error {
  readonly code: CalculationErrorCode

  constructor(code: CalculationErrorCode, message: string) {
    super(message)
    this.name = 'CartCalculationError'
    this.code = code
  }
}

function isProductUnit(value: unknown): value is ProductUnit {
  return typeof value === 'string' && PRODUCT_UNITS.includes(value as ProductUnit)
}

function isPriceBasis(value: unknown): value is PriceBasis {
  return typeof value === 'string' && PRICE_BASES.includes(value as PriceBasis)
}

function requireInteger(value: unknown, field: string, minimum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    throw new CartCalculationError(
      'INVALID_INPUT',
      `${field} must be an integer greater than or equal to ${minimum}`,
    )
  }
  return value
}

function requireScheme(
  input: SchemeInput,
  sellingUnit: ProductUnit,
): CalculationScheme | null {
  if (input === null) return null

  if (Array.isArray(input)) {
    const schemes = input as readonly CalculationScheme[]
    if (schemes.length !== 1) {
      throw new CartCalculationError(
        'AMBIGUOUS_SCHEMES',
        'A cart line must have at most one applicable scheme',
      )
    }
    return requireScheme(schemes[0], sellingUnit)
  }

  const scheme = input as CalculationScheme
  if (!scheme || typeof scheme !== 'object' || !isProductUnit(scheme.sellingUnit)) {
    throw new CartCalculationError('INVALID_SCHEME', 'Scheme configuration is invalid')
  }
  if (scheme.sellingUnit !== sellingUnit) {
    throw new CartCalculationError(
      'INVALID_SCHEME',
      'Scheme selling unit must match the product selling unit',
    )
  }

  if (scheme.kind === 'BUY_X_GET_Y') {
    requireInteger(scheme.buyQty, 'buyQty', 1)
    requireInteger(scheme.freeQtyPerMultiple, 'freeQtyPerMultiple', 1)
    return scheme
  }

  if (scheme.kind === 'THRESHOLD_PERCENT') {
    requireInteger(scheme.minQty, 'minQty', 1)
    requireInteger(scheme.discountBps, 'discountBps', 1)
    if (scheme.discountBps > 10_000) {
      throw new CartCalculationError(
        'INVALID_SCHEME',
        'discountBps must not exceed 10000',
      )
    }
    return scheme
  }

  throw new CartCalculationError('INVALID_SCHEME', 'Scheme kind is not supported')
}

function validateInput(input: CalculationInput): {
  quantity: number
  unitPricePaise: number
  availableStock: number
  scheme: CalculationScheme | null
} {
  const quantity = requireInteger(input.quantity, 'quantity', 1)
  const price = requireInteger(input.unitPricePaise, 'unitPricePaise', 0)
  const stock = requireInteger(input.availableStock, 'availableStock', 0)

  if (!isProductUnit(input.sellingUnit) || !isProductUnit(input.inventoryUnit)) {
    throw new CartCalculationError('INVALID_INPUT', 'Product units are invalid')
  }
  if (!isPriceBasis(input.priceBasis)) {
    throw new CartCalculationError('INVALID_INPUT', 'Price basis is invalid')
  }
  if (input.inventoryUnit !== input.sellingUnit) {
    throw new CartCalculationError(
      'INCOMPATIBLE_UNITS',
      'Inventory unit must match selling unit; conversions are not supported',
    )
  }

  return {
    quantity,
    unitPricePaise: price,
    availableStock: stock,
    scheme: requireScheme(input.scheme, input.sellingUnit),
  }
}

export function calculateLine(input: CalculationInput): CalculationResult {
  const validated = validateInput(input)
  const { quantity: paidQty, unitPricePaise, availableStock, scheme } = validated
  const grossPaise = paidQty * unitPricePaise
  let freeQty = 0
  let discountPaise = 0
  let qualifiedScheme = false

  if (scheme?.kind === 'BUY_X_GET_Y') {
    const completeMultiples = Math.floor(paidQty / scheme.buyQty)
    freeQty = completeMultiples * scheme.freeQtyPerMultiple
    qualifiedScheme = completeMultiples > 0
  } else if (scheme?.kind === 'THRESHOLD_PERCENT') {
    qualifiedScheme = paidQty >= scheme.minQty
    if (qualifiedScheme) {
      discountPaise = Math.floor((grossPaise * scheme.discountBps) / 10_000)
    }
  }

  const requiredStockQty = paidQty + freeQty
  let stockStatus: StockStatus = 'AVAILABLE'
  if (requiredStockQty > availableStock) {
    stockStatus = availableStock === 0 ? 'OUT_OF_STOCK' : 'INSUFFICIENT'
  }

  const warnings: CalculationWarning[] = []
  if (input.priceBasis === 'UNCONFIRMED') {
    warnings.push('PRICE_BASIS_UNCONFIRMED')
  }
  if (stockStatus !== 'AVAILABLE') {
    warnings.push('INSUFFICIENT_STOCK')
  }

  return {
    paidQty,
    freeQty,
    requiredStockQty,
    unitPricePaise,
    priceBasis: input.priceBasis,
    grossPaise,
    discountPaise,
    totalPaise: grossPaise - discountPaise,
    qualifiedScheme,
    stockStatus,
    warning: warnings[0],
    warnings,
  }
}

function lineSortKey(line: CalculationInput, index: number): string {
  return line.productId ?? line.lineId ?? line.sku ?? `~${index.toString().padStart(12, '0')}`
}

export function calculateCart(
  lines: readonly CalculationInput[],
): CartCalculationResult {
  const sortedLines = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => lineSortKey(a.line, a.index).localeCompare(lineSortKey(b.line, b.index)))

  const calculatedLines = sortedLines.map(({ line }) => calculateLine(line))
  return {
    lines: calculatedLines,
    grossPaise: calculatedLines.reduce((sum, line) => sum + line.grossPaise, 0),
    discountPaise: calculatedLines.reduce((sum, line) => sum + line.discountPaise, 0),
    totalPaise: calculatedLines.reduce((sum, line) => sum + line.totalPaise, 0),
    requiredStockQty: calculatedLines.reduce((sum, line) => sum + line.requiredStockQty, 0),
    hasInsufficientStock: calculatedLines.some(
      (line) => line.stockStatus !== 'AVAILABLE',
    ),
    hasUnconfirmedPriceBasis: calculatedLines.some(
      (line) => line.priceBasis === 'UNCONFIRMED',
    ),
  }
}
