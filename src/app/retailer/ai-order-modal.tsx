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
import { Sparkles, X, Check, AlertTriangle, CornerDownLeft, Info, HelpCircle } from 'lucide-react'

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

  const samplePrompts = [
    "2 carton britania biscuits aur 5 packet surf excel bhej do",
    "10 cases Parle-G, 4 boxes Maggi noodles",
    "5 peti Good Day butter cookies aur 3 dabba Tata Salt",
  ]

  return (
    <div>
      <Button
        type="button"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 shadow-xs h-9 font-medium"
        data-testid="ai-order-btn"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span>Order with Natural Language Assist</span>
      </Button>

      {isOpen && (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-card p-5 sm:p-6 shadow-md transition-all animate-in fade-in-50 duration-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold tracking-tight text-foreground">AI Quick Order Assist</h3>
                  <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-[10px] py-0 px-1.5 font-semibold">
                    HINGLISH & ENGLISH
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Natural language extraction with human-in-the-loop SKU and quantity confirmation.
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Quick sample chips */}
          <div className="mt-4">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Try an example:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputText(prompt)}
                  className="rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition-all"
                >
                  &ldquo;{prompt}&rdquo;
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            <Textarea
              placeholder="e.g. 10 cases Parle-G, 5 peti Good Day butter cookies aur 3 packet Surf Excel..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={3}
              className="resize-none text-sm bg-background border-border/80 focus-visible:ring-primary/20"
              data-testid="ai-order-input"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>Units (peti, carton, dabba, pkt) are automatically mapped to SKU pack rules.</span>
              </div>
              <Button
                size="sm"
                onClick={handleParse}
                disabled={isPending || !inputText.trim()}
                data-testid="ai-parse-btn"
                className="gap-1.5 h-8 font-medium shadow-xs"
              >
                <span>{isPending ? 'Analyzing…' : 'Extract Items'}</span>
                <CornerDownLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {feedback && (
            <div
              className={`mt-4 rounded-lg p-3 text-xs ${
                feedback.type === 'error'
                  ? 'border border-destructive/20 bg-destructive/10 text-destructive'
                  : 'border border-primary/20 bg-primary/5 text-primary'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {/* Extraction Confirmation Panel */}
          {extraction && (
            <div className="mt-6 flex flex-col gap-4 border-t border-border/80 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Proposed Product Mappings ({extraction.items.length})
                  </h4>
                  <p className="text-xs text-muted-foreground">Verify mapped SKUs and quantities before adding to your cart.</p>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {extraction.items.filter(i => i.matchedProduct).length}/{extraction.items.length} matched
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {extraction.items.map((item: ParsedOrderItem, idx: number) => {
                  const selected = selectedItems[idx]
                  return (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5 text-xs shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          Parsed phrase: <code className="text-foreground font-semibold bg-muted/60 px-1 py-0.5 rounded">&ldquo;{item.rawLine}&rdquo;</code>
                        </span>
                        {item.matchedProduct && (
                          <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-[10px] font-semibold">
                            {Math.round(item.matchedProduct.confidence * 100)}% confidence
                          </Badge>
                        )}
                      </div>

                      {item.matchedProduct ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-sm text-foreground block truncate">
                              {item.matchedProduct.name}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">{item.matchedProduct.sku}</span>
                            {item.unitAmbiguous && item.clarificationPrompt && (
                              <p className="mt-1 flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium text-[11px]">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span>{item.clarificationPrompt}</span>
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-medium">Quantity:</span>
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
                              className="w-16 rounded-lg border border-input bg-transparent p-1.5 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                            />
                            <span className="font-semibold text-xs text-foreground uppercase">
                              {item.extractedUnit}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-destructive font-medium border-t border-border/40 pt-2">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>No direct SKU match found for &ldquo;{item.extractedProductName}&rdquo;.</span>
                        </div>
                      )}

                      {/* Alternatives if available */}
                      {item.alternatives.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                          <HelpCircle className="h-3 w-3 opacity-70" />
                          <span>Alternative matches:</span>
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
                              className={`rounded-md px-2 py-0.5 border transition-all ${
                                selected?.productId === alt.productId
                                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                                  : 'border-border hover:border-primary/40 text-muted-foreground'
                              }`}
                            >
                              {alt.name} ({Math.round(alt.confidence * 100)}%)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {extraction.unmatchedLines.length > 0 && (
                <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <span className="font-semibold">Unmatched text:</span>
                  <ul className="list-inside list-disc mt-1 text-[11px]">
                    {extraction.unmatchedLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setExtraction(null)}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={isPending || Object.keys(selectedItems).length === 0}
                  data-testid="ai-add-cart-btn"
                  className="gap-1.5 font-medium shadow-xs"
                >
                  <Check className="h-4 w-4" />
                  <span>{isPending ? 'Adding to Cart…' : 'Confirm & Add to Cart'}</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
