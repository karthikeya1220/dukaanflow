'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  parseAiOrderText,
  applyAiItemsToCart,
} from '@/app/actions/ai-order'
import type { AiOrderExtractionResult, ParsedOrderItem } from '@/lib/ai-order-parser'

export function AiOrderModal({ onCartUpdated }: { onCartUpdated?: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const [isPending, startTransition] = useTransition()
  const [extraction, setExtraction] = useState<AiOrderExtractionResult | null>(null)
  const [selectedItems, setSelectedItems] = useState<Record<number, { productId: string; quantity: number }>>({})
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function handleParse() {
    if (!inputText.trim()) return
    setFeedback(null)
    startTransition(async () => {
      const res = await parseAiOrderText({ text: inputText })
      if (res.ok) {
        setExtraction(res.extraction)
        const defaults: Record<number, { productId: string; quantity: number }> = {}
        res.extraction.items.forEach((item, idx) => {
          if (item.matchedProduct) {
            defaults[idx] = {
              productId: item.matchedProduct.productId,
              quantity: item.extractedQuantity,
            }
          }
        })
        setSelectedItems(defaults)
      } else {
        setFeedback({ type: 'error', message: res.message })
      }
    })
  }

  function handleApply() {
    const items = Object.values(selectedItems)
    if (items.length === 0) return
    setFeedback(null)
    startTransition(async () => {
      const res = await applyAiItemsToCart({ items })
      if (res.ok) {
        setFeedback({ type: 'success', message: `Added ${res.addedCount} items to your cart!` })
        setExtraction(null)
        setInputText('')
        onCartUpdated?.()
        setTimeout(() => setIsOpen(false), 1200)
      } else {
        setFeedback({ type: 'error', message: res.message })
      }
    })
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
        data-testid="ai-order-btn"
      >
        <span className="text-base">✨</span>
        <span>Order with Natural Language / Voice Text</span>
      </Button>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.02] p-5 shadow-xs dark:border-primary/30 dark:bg-primary/[0.05]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <h3 className="text-base font-semibold">AI Quick Order Capture</h3>
              <Badge variant="outline" className="text-xs">BETA</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-7 w-7 p-0 text-zinc-500"
            >
              ✕
            </Button>
          </div>

          <p className="mt-1 text-xs text-zinc-500">
            Type or paste orders in simple English or Hinglish (e.g. <em>&ldquo;10 cases Parle-G, 5 carton Good Day biscuit&rdquo;</em>).
            Review the extracted items before confirming to your cart.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <Textarea
              placeholder="e.g. 10 cases Parle-G, 5 peti Good Day butter cookies"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={3}
              className="resize-none text-sm"
              data-testid="ai-order-input"
            />

            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-400">Human review required before adding to cart.</span>
              <Button
                size="sm"
                onClick={handleParse}
                disabled={isPending || !inputText.trim()}
                data-testid="ai-parse-btn"
              >
                {isPending ? 'Analyzing…' : 'Extract Items'}
              </Button>
            </div>
          </div>

          {feedback && (
            <div
              className={`mt-4 rounded-lg p-3 text-xs ${
                feedback.type === 'error'
                  ? 'border border-destructive/50 bg-destructive/10 text-destructive'
                  : 'border border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {/* Extraction Confirmation Panel */}
          {extraction && (
            <div className="mt-5 flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Proposed Product Mappings ({extraction.items.length})
              </h4>

              <div className="flex flex-col gap-3">
                {extraction.items.map((item: ParsedOrderItem, idx: number) => {
                  const selected = selectedItems[idx]
                  return (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-zinc-500">
                          Original input: <code className="text-zinc-800 dark:text-zinc-200">{item.rawLine}</code>
                        </span>
                        {item.matchedProduct && (
                          <Badge variant="outline" className="border-emerald-500/50 text-emerald-600">
                            {item.matchedProduct.confidence}% match
                          </Badge>
                        )}
                      </div>

                      {item.matchedProduct ? (
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {item.matchedProduct.name}
                            </span>
                            <span className="ml-2 font-mono text-zinc-400">({item.matchedProduct.sku})</span>
                            {item.unitAmbiguous && item.clarificationPrompt && (
                              <p className="mt-0.5 text-amber-600 dark:text-amber-400 font-medium">
                                ⚠️ {item.clarificationPrompt}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Qty:</span>
                            <input
                              type="number"
                              min={1}
                              value={selected?.quantity ?? item.extractedQuantity}
                              onChange={(e) =>
                                setSelectedItems((prev) => ({
                                  ...prev,
                                  [idx]: {
                                    productId: selected?.productId ?? item.matchedProduct!.productId,
                                    quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                  },
                                }))
                              }
                              className="w-16 rounded border border-zinc-200 p-1 text-center dark:border-zinc-800 dark:bg-zinc-900"
                            />
                            <span className="font-medium text-zinc-600 dark:text-zinc-400">
                              {item.extractedUnit}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-destructive">No direct SKU match found.</div>
                      )}

                      {/* Alternatives if available */}
                      {item.alternatives.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-zinc-500">
                          <span>Alternatives:</span>
                          {item.alternatives.map((alt) => (
                            <button
                              key={alt.productId}
                              type="button"
                              onClick={() =>
                                setSelectedItems((prev) => ({
                                  ...prev,
                                  [idx]: {
                                    productId: alt.productId,
                                    quantity: selected?.quantity ?? item.extractedQuantity,
                                  },
                                }))
                              }
                              className={`rounded px-2 py-0.5 border ${
                                selected?.productId === alt.productId
                                  ? 'border-primary bg-primary/10 text-primary font-medium'
                                  : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800'
                              }`}
                            >
                              {alt.name} ({alt.confidence}%)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {extraction.unmatchedLines.length > 0 && (
                <div className="rounded-md border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <span className="font-semibold">Unmatched lines:</span>
                  <ul className="list-inside list-disc mt-1">
                    {extraction.unmatchedLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setExtraction(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleApply} disabled={isPending} data-testid="ai-add-cart-btn">
                  {isPending ? 'Adding to Cart…' : 'Confirm & Add to Cart'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
