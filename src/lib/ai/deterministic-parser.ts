import { prisma } from '@/db'
import { ProductUnit } from '@/generated/prisma/enums'

/**
 * Deterministic rule-based order parser.
 *
 * This is NOT an AI model. It is a regex + substring-token-matching engine kept
 * as an explicitly-labelled fallback for when the LLM provider is unavailable
 * or misconfigured. Callers MUST surface `engine: 'deterministic-fallback'` to
 * the user whenever these functions produce the displayed result.
 */

export interface ParsedItemCandidate {
  productId: string
  sku: string
  name: string
  confidence: number
  unit: ProductUnit
}

export interface ParsedOrderItem {
  rawLine: string
  extractedProductName: string
  extractedQuantity: number
  extractedUnit: ProductUnit | null
  matchedProduct: ParsedItemCandidate | null
  alternatives: ParsedItemCandidate[]
  unitAmbiguous: boolean
  requiresReview?: boolean
  clarificationPrompt?: string
}

export interface DeterministicCatalogueEntry {
  id: string
  sku: string
  name: string
  sellingUnit: ProductUnit
}

export interface AiOrderExtractionResult {
  originalText: string
  items: ParsedOrderItem[]
  unmatchedLines: string[]
  engine?: 'ai' | 'deterministic-fallback'
  fallbackReason?: string
  /**
   * Sanitized diagnostic: the OpenRouter model id that actually answered
   * (`payload.model`). May differ from the requested AI_MODEL id when the
   * router auto-selects (e.g. `openrouter/free`). Contains no user content.
   */
  aiModel?: string
}

const UNIT_PATTERNS: Record<string, ProductUnit> = {
  case: ProductUnit.CASE,
  cases: ProductUnit.CASE,
  box: ProductUnit.CASE,
  boxes: ProductUnit.CASE,
  peti: ProductUnit.CASE,
  carton: ProductUnit.CASE,
  cartons: ProductUnit.CASE,
  pack: ProductUnit.PACK,
  packs: ProductUnit.PACK,
  packet: ProductUnit.PACK,
  packets: ProductUnit.PACK,
  pkt: ProductUnit.PACK,
  pkts: ProductUnit.PACK,
  dabba: ProductUnit.PACK,
  piece: ProductUnit.PIECE,
  pieces: ProductUnit.PIECE,
  pc: ProductUnit.PIECE,
  pcs: ProductUnit.PIECE,
  single: ProductUnit.PIECE,
}

function parseLine(line: string): { quantity: number; unit: ProductUnit | null; unitAmbiguous: boolean; productName: string } {
  const clean = line.trim()
  // Pattern: "10 cases Parle-G" or "Parle-G 10 pkt" or "5 Britannia Good Day"
  const qtyFirstRegex = /^(\d+)\s*([a-zA-Z]+)?\s+(.+)$/
  const qtyLastRegex = /^(.+?)\s+(\d+)\s*([a-zA-Z]+)?$/

  let qty = 1
  let unit: ProductUnit | null = null
  let unitAmbiguous = false
  let rawName = clean

  const matchFirst = clean.match(qtyFirstRegex)
  if (matchFirst) {
    qty = parseInt(matchFirst[1], 10)
    const unitWord = matchFirst[2]?.toLowerCase()
    rawName = matchFirst[3]
    if (unitWord && UNIT_PATTERNS[unitWord]) {
      unit = UNIT_PATTERNS[unitWord]
    } else if (unitWord) {
      // e.g. "10 g" or unrecognised unit
      unitAmbiguous = true
    } else {
      unitAmbiguous = true
    }
  } else {
    const matchLast = clean.match(qtyLastRegex)
    if (matchLast) {
      rawName = matchLast[1]
      qty = parseInt(matchLast[2], 10)
      const unitWord = matchLast[3]?.toLowerCase()
      if (unitWord && UNIT_PATTERNS[unitWord]) {
        unit = UNIT_PATTERNS[unitWord]
      } else if (unitWord) {
        unitAmbiguous = true
      } else {
        unitAmbiguous = true
      }
    }
  }

  return {
    quantity: Math.max(1, qty),
    unit,
    unitAmbiguous,
    productName: rawName.trim(),
  }
}

/**
 * Deterministic token-substring scorer over the catalogue.
 * Reused for "alternative match" suggestions regardless of which
 * engine produced the primary mapping.
 */
export function scoreCatalogueMatches(
  productName: string,
  products: DeterministicCatalogueEntry[],
): ParsedItemCandidate[] {
  const queryTokens = productName.toLowerCase().split(/\s+/).filter(Boolean)
  if (queryTokens.length === 0) return []

  const scored = products.map((prod) => {
    const nameLower = prod.name.toLowerCase()
    const skuLower = prod.sku.toLowerCase()
    let matches = 0

    for (const token of queryTokens) {
      if (nameLower.includes(token) || skuLower.includes(token)) {
        matches += 1
      }
    }

    const score = matches / Math.max(queryTokens.length, 1)
    return { product: prod, score }
  })

  scored.sort((a, b) => b.score - a.score)

  return scored
    .filter((sp) => sp.score > 0)
    .slice(0, 3)
    .map((sp) => ({
      productId: sp.product.id,
      sku: sp.product.sku,
      name: sp.product.name,
      confidence: Math.round(sp.score * 100),
      unit: sp.product.sellingUnit,
    }))
}

export function buildCandidateItem(
  line: string,
  quantity: number,
  unit: ProductUnit | null,
  unitAmbiguous: boolean,
  productName: string,
  candidates: ParsedItemCandidate[],
): ParsedOrderItem {
  if (candidates.length === 0) {
    return {
      rawLine: line,
      extractedProductName: productName,
      extractedQuantity: quantity,
      extractedUnit: unit,
      matchedProduct: null,
      alternatives: [],
      unitAmbiguous,
      requiresReview: true,
    }
  }

  const matched = candidates[0]
  const alternatives = candidates.slice(1, 3)
  const lowConfidence = matched.confidence < 70
  const unitMismatch = unit !== null && unit !== matched.unit
  const isAmbiguous = unitAmbiguous || unit === null || unitMismatch

  let clarification = undefined
  if (unitMismatch) {
    clarification = `Requested in ${unit.toLowerCase()}s, but this item is only orderable in ${matched.unit.toLowerCase()}s. Did you mean ${quantity} ${matched.unit.toLowerCase()}${quantity > 1 ? 's' : ''}?`
  } else if (isAmbiguous) {
    clarification = `Did you mean ${quantity} ${matched.unit.toLowerCase()}${quantity > 1 ? 's' : ''}?`
  }

  return {
    rawLine: line,
    extractedProductName: productName,
    extractedQuantity: quantity,
    extractedUnit: unit ?? matched.unit,
    matchedProduct: matched,
    alternatives,
    unitAmbiguous: isAmbiguous,
    requiresReview: isAmbiguous || lowConfidence,
    clarificationPrompt: clarification,
  }
}

/**
 * Parses natural language orders with product matching, quantity and unit extraction,
 * alternatives for ambiguous matches, and confidence scoring.
 * Preserves original retailer input.
 */
export async function parseDeterministicOrder(
  retailerId: string,
  inputText: string,
): Promise<AiOrderExtractionResult> {
  const lines = inputText
    .split(/\r?\n|,|\s+aur\s+|\s+and\s+/i)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  // Fetch available catalogue products
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      sellingUnit: true,
    },
  })

  const items: ParsedOrderItem[] = []
  const unmatchedLines: string[] = []

  for (const line of lines) {
    const { quantity, unit, unitAmbiguous, productName } = parseLine(line)
    const candidates = scoreCatalogueMatches(productName, products)

    if (candidates.length === 0) {
      unmatchedLines.push(line)
      continue
    }

    items.push(buildCandidateItem(line, quantity, unit, unitAmbiguous, productName, candidates))
  }

  return {
    originalText: inputText,
    items,
    unmatchedLines,
    engine: 'deterministic-fallback',
    fallbackReason: 'RULE_BASED_PARSER',
  }
}

export async function fetchActiveCatalogue() {
  return prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      sellingUnit: true,
      inventoryUnit: true,
    },
  })
}
