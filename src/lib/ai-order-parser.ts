import type { ProductUnit } from '@/generated/prisma/enums'
import {
  fetchActiveCatalogue,
  parseDeterministicOrder,
  scoreCatalogueMatches,
  type ParsedItemCandidate,
  type ParsedOrderItem,
  type AiOrderExtractionResult,
  type DeterministicCatalogueEntry,
} from '@/lib/ai/deterministic-parser'
import { callAiOrderExtraction, isAiOrderConfigured, AiProviderError, getAiModel } from '@/lib/ai/openrouter'

export type {
  ParsedItemCandidate,
  ParsedOrderItem,
  AiOrderExtractionResult,
} from '@/lib/ai/deterministic-parser'

/**
 * AI order-capture orchestrator.
 *
 * Contract with the assessment rules:
 * - A real LLM (OpenRouter) proposes product mappings; when the provider is
 *   unavailable the deterministic rule engine is used and the result is
 *   explicitly labelled `engine: 'deterministic-fallback'`.
 * - Every SKU the model proposes is revalidated against the live database
 *   catalogue before being returned. Model-invented SKUs are discarded.
 * - The model never sees or returns prices, discounts, schemes or stock, and
 *   can never submit or approve orders. Cart insertion still requires an
 *   explicit human confirmation click validated against the database.
 */

function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0
  return Math.max(0, Math.min(1, confidence))
}

function mapAiUnit(unit: string | null | undefined): ProductUnit | null {
  return unit && (unit === 'CASE' || unit === 'PACK' || unit === 'PIECE') ? unit : null
}

function itemFromModelProposal(
  rawLine: string,
  productName: string,
  quantity: number,
  unit: ProductUnit | null,
  confidenceLabel: string | undefined,
  matched: ParsedItemCandidate | null,
  alternatives: ParsedItemCandidate[],
  ambiguous: boolean,
  clarification: string | undefined,
): ParsedOrderItem {
  const noUnit = unit === null
  const unitMismatch = matched !== null && unit !== null && unit !== matched.unit
  const isAmbiguous = ambiguous || noUnit || unitMismatch
  const requiresReview = matched === null || isAmbiguous || matched.confidence < 70

  let prompt = clarification
  if (!prompt && matched) {
    if (unitMismatch) {
      prompt = `Requested in ${unit?.toLowerCase()}s, but this item is only orderable in ${matched.unit.toLowerCase()}s. Did you mean ${quantity} ${matched.unit.toLowerCase()}${quantity > 1 ? 's' : ''}?`
    } else if (noUnit) {
      prompt = `Did you mean ${Math.max(1, Math.floor(quantity))} ${matched.unit.toLowerCase()}${quantity > 1 ? 's' : ''}?`
    }
  }

  return {
    rawLine,
    extractedProductName: productName,
    extractedQuantity: Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1,
    extractedUnit: unit ?? matched?.unit ?? null,
    matchedProduct: matched,
    alternatives,
    unitAmbiguous: isAmbiguous,
    requiresReview,
    clarificationPrompt: prompt,
  }
}

async function extractWithAi(
  inputText: string,
  products: DeterministicCatalogueEntry[],
): Promise<AiOrderExtractionResult> {
  const { extraction: modelResult, responseModel } = await callAiOrderExtraction(inputText, products)

  // DB revalidation index — the only source of valid product identities.
  const bySku = new Map(products.map((p) => [p.sku, p]))
  const items: ParsedOrderItem[] = []
  const unmatchedLines = [...modelResult.unmatchedLines]

  for (const proposal of modelResult.items) {
    const matchedSkuValid =
      typeof proposal.matchedSku === 'string' && proposal.matchedSku.length > 0
        ? bySku.get(proposal.matchedSku) ?? null
        : null

    const matched: ParsedItemCandidate | null = matchedSkuValid
      ? {
          productId: matchedSkuValid.id,
          sku: matchedSkuValid.sku,
          name: matchedSkuValid.name,
          confidence: Math.round(clampConfidence(proposal.confidence) * 100),
          unit: matchedSkuValid.sellingUnit,
        }
      : null

    // Deterministic scorer provides alternate suggestions from real SKUs only.
    const alternatives = scoreCatalogueMatches(proposal.productName, products).filter(
      (c) => c.sku !== matched?.sku,
    )

    const item = itemFromModelProposal(
      proposal.rawLine,
      proposal.productName,
      proposal.quantity,
      mapAiUnit(proposal.unit),
      undefined,
      matched,
      alternatives,
      Boolean(proposal.ambiguous),
      proposal.clarification ?? undefined,
    )
    items.push(item)

    if (!matched) {
      unmatchedLines.push(proposal.rawLine)
    }
  }

  return {
    originalText: inputText,
    items,
    unmatchedLines,
    engine: 'ai',
    aiModel: responseModel ?? undefined,
  }
}

/**
 * Parses natural language order text into validated SKU proposals.
 * Requires an explicit human confirmation step (UI) before anything reaches
 * the cart, and DB revalidation of every proposal server-side.
 */
export async function parseNaturalLanguageOrder(
  retailerId: string,
  inputText: string,
): Promise<AiOrderExtractionResult> {
  try {
    if (!isAiOrderConfigured()) {
      throw new AiProviderError(
        'AI_MISSING_CREDENTIALS',
        'AI_API_KEY is not configured; using the rule-based helper engine',
      )
    }
    const products = await fetchActiveCatalogue()
    const aiResult = await extractWithAi(inputText, products)
    // Sanitized telemetry only: engine + model id + item count. The prompt,
    // retailer text and raw model response are never logged.
    console.info(
      `[ai-order] engine=ai model=${aiResult.aiModel ?? 'unknown'} items=${aiResult.items.length}`,
    )
    return aiResult
  } catch (error) {
    const fallbackReason =
      error instanceof AiProviderError
        ? error.code
        : 'AI_PROVIDER_ERROR'
    // Sanitized warning: reason code and requested model id only — never the
    // prompt, retailer text or raw model response content.
    console.warn(
      `[ai-order] falling back engine=deterministic-fallback reason=${fallbackReason} requestedModel=${getAiModel()}`,
    )
    const fallback = await parseDeterministicOrder(retailerId, inputText)
    return { ...fallback, engine: 'deterministic-fallback', fallbackReason }
  }
}
