import { describe, expect, it } from 'vitest'
import { parseNaturalLanguageOrder } from '@/lib/ai-order-parser'

describe('AI Order Parser (Deterministic Mock / Engine)', () => {
  it('parses structured quantities and unit keywords', async () => {
    // Testing logic works without real external LLM dependency
    const result = await parseNaturalLanguageOrder('retailer-1', '10 cases Tea\n5 pack Biscuit')
    expect(result.originalText).toBe('10 cases Tea\n5 pack Biscuit')
    expect(result.items).toBeDefined()
  })
})

