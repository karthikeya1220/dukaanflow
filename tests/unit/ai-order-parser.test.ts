import { describe, expect, it } from 'vitest'
import { parseDeterministicOrder } from '@/lib/ai/deterministic-parser'

/**
 * Regression test for the deterministic rule engine. This engine is a
 * non-AI fallback and must never be presented to users as an AI result
 * (the orchestrator labels results with engine: 'deterministic-fallback').
 */
describe('Deterministic Order Parser (rule-based fallback engine)', () => {
  it('parses structured quantities and unit keywords from real catalogue SKUs', async () => {
    const result = await parseDeterministicOrder('retailer-1', '10 cases Tea\n5 pack Biscuit')
    expect(result.originalText).toBe('10 cases Tea\n5 pack Biscuit')
    expect(result.items).toBeDefined()
    expect(result.engine).toBe('deterministic-fallback')
  })
})
