import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Deterministic catalogue fixture (unit test — no database).
vi.mock('@/db', () => ({
  prisma: {
    product: {
      findMany: vi.fn(async () => [
        { id: 'prod-a1', sku: 'SKU-TEA-500', name: 'Tata Tea Gold 500g', sellingUnit: 'PACK' },
        { id: 'prod-b2', sku: 'SKU-PARLE-G', name: 'Parle-G Glucose Biscuit', sellingUnit: 'CASE' },
        { id: 'prod-c3', sku: 'SKU-SURF-EXC', name: 'Surf Excel Detergent Powder', sellingUnit: 'PACK' },
      ]),
    },
  },
}))

import { parseNaturalLanguageOrder } from '@/lib/ai-order-parser'
import { extractJsonObject, AiProviderError } from '@/lib/ai/openrouter'

type MockResponseInit = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text?: () => Promise<string>
}

function openRouterResponse(payload: unknown, init?: Partial<MockResponseInit>): MockResponseInit {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => payload,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  }
}

function modelReply(rawModelOutput: unknown | string, init?: Partial<MockResponseInit>): MockResponseInit {
  const content = typeof rawModelOutput === 'string' ? rawModelOutput : JSON.stringify(rawModelOutput)
  return openRouterResponse({ choices: [{ message: { content } }] }, init)
}

describe('AI order capture (OpenRouter orchestrator)', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    delete process.env.AI_API_KEY
    delete process.env.AI_MODEL
    delete process.env.AI_TIMEOUT_MS
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
  })

  it('falls back to the labelled rule-based engine when AI credentials are missing', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G, 5 pack tea')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.engine).toBe('deterministic-fallback')
    expect(result.fallbackReason).toBe('AI_MISSING_CREDENTIALS')
    expect(result.originalText).toBe('10 cases Parle-G, 5 pack tea')
    // Rule-based suggestions still come from real database SKUs only.
    for (const item of result.items) {
      expect(item.matchedProduct === null || item.matchedProduct.sku.startsWith('SKU-')).toBe(true)
    }
  })

  it('uses the real AI result and validates proposals against the live catalogue', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        modelReply({
          items: [
            {
              rawLine: '5 packet Surf Excel',
              productName: 'Surf Excel',
              quantity: 5,
              unit: 'PACK',
              matchedSku: 'SKU-SURF-EXC',
              confidence: 0.94,
              ambiguous: false,
              clarification: null,
            },
            {
              // Model hallucinates a SKU that does not exist — must be discarded.
              rawLine: '20 box Fake Product Pro',
              productName: 'Fake Product Pro',
              quantity: 20,
              unit: 'CASE',
              matchedSku: 'INVENTED-SKU-999',
              confidence: 0.98,
              ambiguous: false,
              clarification: null,
            },
          ],
          unmatchedLines: [],
        }),
      ),
    )

    const result = await parseNaturalLanguageOrder('retailer-1', '5 packet Surf Excel, 20 box Fake Product Pro')

    expect(result.engine).toBe('ai')
    expect(result.items).toHaveLength(2)

    const valid = result.items[0]
    expect(valid.matchedProduct?.sku).toBe('SKU-SURF-EXC')
    expect(valid.matchedProduct?.productId).toBe('prod-c3')
    expect(valid.matchedProduct?.confidence).toBe(94)
    expect(valid.extractedQuantity).toBe(5)
    expect(valid.extractedUnit).toBe('PACK')
    expect(valid.requiresReview).toBe(false)

    const invented = result.items[1]
    expect(invented.matchedProduct).toBeNull()
    expect(invented.requiresReview).toBe(true)
    expect(result.unmatchedLines).toContain('20 box Fake Product Pro')
  })

  it('flags ambiguous units and low-confidence matches for manual review', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        modelReply({
          items: [
            {
              rawLine: 'thoda chai de do',
              productName: 'chai',
              quantity: 1,
              unit: null,
              matchedSku: 'SKU-TEA-500',
              confidence: 0.4,
              ambiguous: true,
              clarification: 'How many packs do you need?',
            },
          ],
          unmatchedLines: [],
        }),
      ),
    )

    const result = await parseNaturalLanguageOrder('retailer-1', 'thoda chai de do')
    expect(result.engine).toBe('ai')
    const item = result.items[0]
    expect(item.requiresReview).toBe(true)
    expect(item.unitAmbiguous).toBe(true)
    expect(item.clarificationPrompt).toBe('How many packs do you need?')
    expect(item.extractedQuantity).toBe(1)
  })

  it('falls back with AI_MALFORMED_RESPONSE when the model emits invalid JSON', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    const fetchSpy = vi.fn(async () => modelReply('```json\n{"items": [not valid json\n```'))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G')
    expect(result.engine).toBe('deterministic-fallback')
    expect(result.fallbackReason).toBe('AI_MALFORMED_RESPONSE')
  })

  it('falls back with AI_MALFORMED_RESPONSE when the response violates the contract', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => modelReply({ unexpected: 'shape', no_items: true })),
    )

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G')
    expect(result.engine).toBe('deterministic-fallback')
    expect(result.fallbackReason).toBe('AI_MALFORMED_RESPONSE')
  })

  it('falls back with AI_RATE_LIMITED on provider 429', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    const fetchSpy = vi.fn(async () =>
      openRouterResponse({ error: { message: 'rate limited' } }, { ok: false, status: 429 }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G')
    expect(result.engine).toBe('deterministic-fallback')
    expect(result.fallbackReason).toBe('AI_RATE_LIMITED')
  })

  it('falls back with AI_PROVIDER_ERROR on provider 5xx', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        openRouterResponse({ error: 'upstream failure' }, { ok: false, status: 502 }),
      ),
    )

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G')
    expect(result.engine).toBe('deterministic-fallback')
    expect(result.fallbackReason).toBe('AI_PROVIDER_ERROR')
  })

  it('falls back with AI_TIMEOUT when the request aborts', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    process.env.AI_TIMEOUT_MS = '10'
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      throw abortError
    }))

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G')
    expect(result.engine).toBe('deterministic-fallback')
    expect(result.fallbackReason).toBe('AI_TIMEOUT')
  })

  it('requests the default free-router model (openrouter/free) when AI_MODEL is unset', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    let capturedRequestInit: RequestInit | undefined
    const fetchSpy = vi.fn(async (url: string | URL, init?: RequestInit) => {
      capturedRequestInit = init
      void url
      return modelReply({
        items: [
          {
            rawLine: '10 cases Parle-G',
            productName: 'Parle-G',
            quantity: 10,
            unit: 'CASE',
            matchedSku: 'SKU-PARLE-G',
            confidence: 0.95,
          },
        ],
        unmatchedLines: [],
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G')

    expect(result.engine).toBe('ai')
    const requestBody = JSON.parse(String(capturedRequestInit?.body))
    expect(requestBody.model).toBe('openrouter/free')
    expect(requestBody.response_format).toEqual({ type: 'json_object' })
  })

  it('retries without response_format when the selected free model rejects JSON mode', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { response_format?: unknown }
      if (body.response_format) {
        // Simulated free model that does not support structured output.
        return openRouterResponse(
          { error: { message: "response_format json_object is not supported by this model", code: 400 } },
          { ok: false, status: 400 },
        )
      }
      // Retry without JSON mode succeeds.
      return modelReply({
        items: [
          {
            rawLine: '10 cases Parle-G',
            productName: 'Parle-G',
            quantity: 10,
            unit: 'CASE',
            matchedSku: 'SKU-PARLE-G',
            confidence: 0.9,
          },
        ],
        unmatchedLines: [],
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G')

    expect(result.engine).toBe('ai')
    const secondRequestBody = JSON.parse(
      (fetchSpy.mock.calls[1][1] as { body: string }).body,
    ) as { response_format?: unknown }
    expect(secondRequestBody.response_format).toBeUndefined()
  })

  it('captures the actual model id returned by the router for sanitised diagnostics', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    // Auto-router: requested openrouter/free, but the response names a concrete free model.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        openRouterResponse({
          model: 'z-ai/glm-4.6:free',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: [
                    {
                      rawLine: '5 pack Surf Excel',
                      productName: 'Surf Excel',
                      quantity: 5,
                      unit: 'PACK',
                      matchedSku: 'SKU-SURF-EXC',
                      confidence: 0.9,
                    },
                  ],
                  unmatchedLines: [],
                }),
              },
            },
          ],
        }),
      ),
    )

    const result = await parseNaturalLanguageOrder('retailer-1', '5 pack Surf Excel')

    expect(result.engine).toBe('ai')
    expect(result.aiModel).toBe('z-ai/glm-4.6:free')
  })

  it('does not retry paid-model substitution on failures outside unsupported JSON mode', async () => {
    process.env.AI_API_KEY = 'test-secret-key'
    const fetchSpy = vi.fn(async () =>
      openRouterResponse(
        { error: { message: 'model unavailable' } },
        { ok: false, status: 404 },
      ),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Parle-G')

    // Exactly one HTTP attempt: no model substitution, straight to rule-based fallback.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.engine).toBe('deterministic-fallback')
    expect(result.fallbackReason).toBe('AI_PROVIDER_ERROR')
  })
})

describe('extractJsonObject hardening', () => {
  it('parses fenced JSON', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('extracts the first JSON object from prose', () => {
    expect(extractJsonObject('Sure! {"a":1} hope that helps')).toEqual({ a: 1 })
  })
  it('throws AI_MALFORMED_RESPONSE when no object exists', () => {
    expect(() => extractJsonObject('no json here')).toThrowError(AiProviderError)
  })
})
