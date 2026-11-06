import { z } from 'zod'
import type { DeterministicCatalogueEntry } from './deterministic-parser'

/**
 * Server-only OpenRouter LLM client for AI order capture.
 * NEVER import this module from a client component.
 *
 * Credentials are read from environment variables and are never returned
 * to the browser under any circumstances.
 *
 * Environment variables:
 * - AI_API_KEY        OpenRouter API key (sk-or-...). Required to enable AI.
 * - AI_MODEL          OpenRouter model id. Default: "openrouter/free" — OpenRouter's
 *                     auto-router, which dynamically selects an available free-tier
 *                     model. Never auto-switched to a paid model by this app.
 * - AI_TIMEOUT_MS     Hard request timeout in milliseconds. Default: 20000.
 */

export type AiProviderErrorCode =
  | 'AI_MISSING_CREDENTIALS'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_PROVIDER_ERROR'
  | 'AI_MALFORMED_RESPONSE'

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiProviderErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AiProviderError'
  }
}

export function getAiApiKey(): string | undefined {
  const key = process.env.AI_API_KEY?.trim()
  return key ? key : undefined
}

export function getAiModel(): string {
  const model = process.env.AI_MODEL?.trim()
  return model && model.length > 0 ? model : 'openrouter/free'
}

function getAiTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AI_TIMEOUT_MS ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20_000
}

export function isAiOrderConfigured(): boolean {
  return Boolean(getAiApiKey())
}

/** Internal signal used to retry once without JSON mode. */
class JsonModeUnsupportedError extends Error {}

/**
 * Model output contract. The model may only reference SKUs that exist in the
 * provided catalogue; every proposal is revalidated against the database by
 * the caller before it is ever shown or applied.
 */
const modelItemsSchema = z.object({
  items: z
    .array(
      z.object({
        rawLine: z.string(),
        productName: z.string(),
        quantity: z.number().finite(),
        unit: z.enum(['CASE', 'PACK', 'PIECE']).nullable().optional(),
        matchedSku: z.string().nullable().optional(),
        confidence: z.number().finite().min(0).max(1),
        ambiguous: z.boolean().optional(),
        clarification: z.string().nullable().optional(),
      }),
    )
    .nonempty(),
  unmatchedLines: z.array(z.string()).default([]),
})

export type ModelOrderExtraction = z.infer<typeof modelItemsSchema>

function buildSystemPrompt(products: DeterministicCatalogueEntry[]): string {
  const catalogueLines = products
    .map((p) => `- sku=${p.sku} | name=${p.name} | sellingUnit=${p.sellingUnit}`)
    .join('\n')

  return [
    'You are an order-capture assistant for an FMCG distributor. Retailers send informal (often Hinglish) order text; you extract structured line items.',
    '',
    'You may ONLY propose products whose sku appears exactly as given in this catalogue. Never invent SKUs, product ids, prices, discounts, schemes, or stock quantities. If you cannot confidently identify a SKU, return matchedSku as null.',
    '',
    'CATALOGUE:',
    catalogueLines,
    '',
    'Rules:',
    '- quantity: positive integer number of units the retailer wants. Default to 1 if unclear, and set ambiguous=true.',
    '- unit: interpret colloquial words (case/carton/peti/box -> CASE; pack/packet/pkt/dabba -> PACK; piece/pc/single -> PIECE). If the retailer stated unit differs from the product sellingUnit (e.g. retailer asks for packets/PACK but the product sellingUnit is CASE), set ambiguous=true and provide clarification asking if they want that many cases or individual packs.',
    '- confidence: 0 to 1, your certainty that matchedSku is the correct product for the phrase.',
    '- ambiguous: true when the unit is unclear, the requested unit does not match the product sellingUnit, the product reference is vague, or several catalogue SKUs could match.',
    '- clarification: a short question to ask the retailer when ambiguous (e.g. "Only cases are sold. Did you mean 5 cases?"), else null.',
    '- Preserve the retailer\'s wording in rawLine and productName. Do not translate or correct it.',
    '- matchedSku must be copied EXACTLY from the catalogue list, or null.',
    '',
    'Respond with ONLY a JSON object (no markdown, no prose) shaped exactly like:',
    '{"items":[{"rawLine":"string","productName":"string","quantity":1,"unit":"CASE|PACK|PIECE|null","matchedSku":"string|null","confidence":0.0,"ambiguous":false,"clarification":"string|null"}],"unmatchedLines":["string"]}',
    'Line fragments you could not understand go in unmatchedLines and are omitted from items.',
  ].join('\n')
}

/**
 * Extract JSON from a model response, tolerating markdown code fences.
 */
export function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced ? fenced[1] : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new AiProviderError('AI_MALFORMED_RESPONSE', 'Model response contained no JSON object')
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    throw new AiProviderError('AI_MALFORMED_RESPONSE', 'Model response was not valid JSON')
  }
}

function mapHttpError(status: number, bodyExcerpt: string): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError('AI_PROVIDER_ERROR', 'OpenRouter rejected the API credentials')
  }
  if (status === 429) {
    return new AiProviderError('AI_RATE_LIMITED', 'AI provider rate limit reached')
  }
  return new AiProviderError(
    'AI_PROVIDER_ERROR',
    `AI provider request failed (HTTP ${status})${bodyExcerpt ? `: ${bodyExcerpt}` : ''}`,
  )
}

/**
 * True when an OpenRouter error indicates the dynamically-selected model does
 * not support structured output (`response_format`). Many free-tier models
 * reject JSON mode, so the request is retried once without it. Detection is
 * deliberately conservative: matching status + error-text keywords.
 */
function isUnsupportedJsonModeError(status: number, bodyExcerpt: string): boolean {
  if (status !== 400 && status !== 422 && status !== 404) return false
  const lowered = bodyExcerpt.toLowerCase()
  return (
    lowered.includes('response_format') ||
    lowered.includes('structured output') ||
    (lowered.includes('json_object') && lowered.includes('not supported')) ||
    (lowered.includes('json') && lowered.includes('unsupported'))
  )
}

/**
 * Calls OpenRouter chat completions and returns the validated structured
 * extraction plus the actual model id that answered (`responseModel`, from
 * the response body's `model` field) for sanitized diagnostics.
 * Throws AiProviderError on any failure — callers decide the fallback strategy.
 *
 * JSON mode: the first attempt requests `response_format: json_object`. If the
 * dynamically-selected free model rejects structured output (common on free
 * tiers), the request is retried once WITHOUT `response_format` — the prompt
 * itself already demands a bare JSON object, and Zod still validates the body.
 */
export async function callAiOrderExtraction(
  text: string,
  products: DeterministicCatalogueEntry[],
): Promise<{ extraction: ModelOrderExtraction; responseModel: string | null }> {
  const apiKey = getAiApiKey()
  if (!apiKey) {
    throw new AiProviderError('AI_MISSING_CREDENTIALS', 'AI_API_KEY is not configured')
  }

  const requestOnce = async (
    jsonMode: boolean,
  ): Promise<{ extraction: ModelOrderExtraction; responseModel: string | null }> => {
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), getAiTimeoutMs())

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
          'X-Title': 'DukaanFlow',
        },
        body: JSON.stringify({
          model: getAiModel(),
          temperature: 0,
          max_tokens: 2048,
          // JSON mode is requested but not assumed: retried without it below
          // for free models that do not support structured output.
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: buildSystemPrompt(products) },
            { role: 'user', content: text },
          ],
        }),
      })

      if (!response.ok) {
        const bodyExcerpt = (await response.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ')
        if (jsonMode && isUnsupportedJsonModeError(response.status, bodyExcerpt)) {
          throw new JsonModeUnsupportedError(bodyExcerpt)
        }
        throw mapHttpError(response.status, bodyExcerpt)
      }

      let payload: {
        model?: string
        choices?: Array<{ message?: { content?: string } }>
      }
      try {
        payload = (await response.json()) as typeof payload
      } catch {
        throw new AiProviderError('AI_MALFORMED_RESPONSE', 'AI provider returned non-JSON HTTP body')
      }

      // Sanitized diagnostic: the actual model that answered (may differ from
      // the requested id when a router auto-selects). Contains no user data.
      const responseModel =
        typeof payload.model === 'string' && payload.model.trim().length > 0
          ? payload.model.trim()
          : null

      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new AiProviderError('AI_MALFORMED_RESPONSE', 'AI response contained no message content')
      }

      const parsed = modelItemsSchema.safeParse(extractJsonObject(content))
      if (!parsed.success) {
        throw new AiProviderError(
          'AI_MALFORMED_RESPONSE',
          'AI response did not match the extraction contract',
        )
      }
      return { extraction: parsed.data, responseModel }
    } catch (error) {
      if (error instanceof JsonModeUnsupportedError) throw error
      if (error instanceof AiProviderError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError('AI_TIMEOUT', `AI request exceeded ${getAiTimeoutMs()}ms`)
      }
      throw new AiProviderError(
        'AI_PROVIDER_ERROR',
        error instanceof Error ? error.message : 'Unknown AI provider failure',
      )
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  try {
    return await requestOnce(true)
  } catch (error) {
    if (error instanceof JsonModeUnsupportedError) {
      return await requestOnce(false)
    }
    throw error
  }
}
