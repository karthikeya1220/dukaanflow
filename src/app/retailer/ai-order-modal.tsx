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
import {
  Sparkles,
  X,
  Check,
  AlertTriangle,
  CornerDownLeft,
  Info,
  HelpCircle,
  MessageSquareQuote,
  ShieldCheck,
  Bot
} from 'lucide-react'

const FALLBACK_REASON_LABELS: Record<string, string> = {
  AI_MISSING_CREDENTIALS: 'AI is not configured on this deployment',
  AI_TIMEOUT: 'the AI request timed out',
  AI_RATE_LIMITED: 'the AI provider is rate-limited',
  AI_MALFORMED_RESPONSE: 'the AI service returned an unusable response',
  AI_PROVIDER_ERROR: 'the AI provider reported an error',
}

export function AiOrderModal({ onCartUpdated }: { onCartUpdated?: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const [isPending, startTransition] = useTransition()
  const [extraction, setExtraction] = useState<AiOrderExtractionResult | null>(null)
  const [selectedItems, setSelectedItems] = useState<Record<number, { productId: string; quantity: number }>>({})
  const [lineQuantities, setLineQuantities] = useState<Record<number, number>>({})
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function handleParse() {
    if (!inputText.trim()) return
    setFeedback(null)
    startTransition(async () => {
      const res = await parseAiOrderText({ text: inputText })
      if (res.ok) {
        setExtraction(res.extraction)
        const defaults: Record<number, { productId: string; quantity: number }> = {}
        const initialQtys: Record<number, number> = {}
        res.extraction.items.forEach((item, idx) => {
          initialQtys[idx] = item.extractedQuantity
          // Never preselect low-confidence or ambiguous proposals for cart
          // insertion — they require an explicit human selection/review.
          if (item.matchedProduct && !item.requiresReview) {
            defaults[idx] = {
              productId: item.matchedProduct.productId,
              quantity: item.extractedQuantity,
            }
          }
        })
        setSelectedItems(defaults)
        setLineQuantities(initialQtys)
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
    "2 cases Glucose biscuit, 5 boxes Britannia Good Day",
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
        <span>Natural Language Assist</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs animate-in fade-in-20">
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                      Natural Language Order Capture
                    </h3>
                    <Badge
                      variant="outline"
                      className={`text-[10px] py-0 px-2 font-semibold ${extraction?.engine === 'deterministic-fallback'
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'border-primary/40 bg-primary/5 text-primary'
                        }`}
                    >
                      {extraction?.engine === 'deterministic-fallback' ? 'RULE-BASED FALLBACK' : 'AI POWERED'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Paste raw WhatsApp or spoken FMCG orders. Suggestions require explicit human confirmation.
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close assist modal</span>
              </Button>
            </div>

            <div className="overflow-y-auto flex-1 py-4 pr-1">
              {/* Sample prompts */}
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Try an example:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {samplePrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setInputText(prompt)}
                      className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition-all duration-150"
                    >
                      &ldquo;{prompt}&rdquo;
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Input Area */}
              <div className="mt-3.5 flex flex-col gap-2.5">
                <Textarea
                  placeholder="e.g. 10 cases Parle-G, 5 peti Good Day butter cookies aur 3 packet Surf Excel..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={3}
                  className="resize-none text-sm bg-background border-border/80 focus-visible:ring-primary/20 rounded-xl"
                  data-testid="ai-order-input"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>Hinglish units (peti, dabba, carton) map to distributor pack rules.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleParse}
                    disabled={isPending || !inputText.trim()}
                    data-testid="ai-parse-btn"
                    className="gap-1.5 h-8 font-semibold shadow-2xs rounded-lg"
                  >
                    <span>{isPending ? 'Analyzing…' : 'Extract Items'}</span>
                    <CornerDownLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Toast feedback */}
              {feedback && (
                <div
                  className={`mt-3.5 rounded-xl p-3 text-xs flex items-center gap-2 ${feedback.type === 'error'
                      ? 'border border-destructive/20 bg-destructive/10 text-destructive'
                      : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    }`}
                >
                  {feedback.type === 'error' ? (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-medium">{feedback.message}</span>
                </div>
              )}

              {/* AI Fallback Alert */}
              {extraction?.engine === 'deterministic-fallback' && (
                <div
                  role="status"
                  data-testid="ai-fallback-notice"
                  className="mt-3.5 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    AI service unavailable{extraction.fallbackReason && FALLBACK_REASON_LABELS[extraction.fallbackReason] ? ` — ${FALLBACK_REASON_LABELS[extraction.fallbackReason]}` : ''}
                    {extraction.aiModel ? ` (model: ${extraction.aiModel})` : ''}
                  </span>
                  <p className="mt-1">
                    Suggestions below come from a rule-based helper (not AI). You can also order manually
                    from the <a href="/retailer" className="underline font-medium">catalogue</a>.
                  </p>
                </div>
              )}

              {/* Proposed Mappings List */}
              {extraction && (
                <div className="mt-5 flex flex-col gap-3.5 border-t border-border/80 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Proposed Product Mappings ({extraction.items.length})
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Review suggested SKUs and quantities before confirming additions.
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded-md">
                      {extraction.items.filter((i) => i.matchedProduct).length}/{extraction.items.length} matched
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {extraction.items.map((item: ParsedOrderItem, idx: number) => {
                      const selected = selectedItems[idx]
                      return (
                        <div
                          key={idx}
                          className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3.5 text-xs shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <MessageSquareQuote className="h-3.5 w-3.5 text-muted-foreground/70" />
                              <code className="text-foreground font-semibold bg-muted/60 px-1.5 py-0.5 rounded">
                                &ldquo;{item.rawLine}&rdquo;
                              </code>
                            </span>
                            {item.matchedProduct && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-semibold py-0 px-1.5 ${item.requiresReview
                                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                    : 'border-primary/40 bg-primary/5 text-primary'
                                  }`}
                              >
                                {item.matchedProduct.confidence}% confidence{item.requiresReview ? ' · needs review' : ''}
                              </Badge>
                            )}
                          </div>

                          {item.matchedProduct ? (
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-2.5">
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
                                  value={lineQuantities[idx] ?? selected?.quantity ?? item.extractedQuantity}
                                  onChange={(e) => {
                                    const newQty = Math.max(1, parseInt(e.target.value, 10) || 1)
                                    setLineQuantities((prev) => ({ ...prev, [idx]: newQty }))
                                    if (item.requiresReview) {
                                      // Invalidate existing confirmation if any; do NOT auto-confirm
                                      setSelectedItems((prev) => {
                                        const next = { ...prev }
                                        delete next[idx]
                                        return next
                                      })
                                    } else {
                                      setSelectedItems((prev) => ({
                                        ...prev,
                                        [idx]: {
                                          productId: selected?.productId ?? item.matchedProduct!.productId,
                                          quantity: newQty,
                                        },
                                      }))
                                    }
                                  }}
                                  className="w-16 rounded-lg border border-input bg-card p-1.5 text-center text-xs font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                                />
                                <span className="font-semibold text-xs text-foreground uppercase">
                                  {item.matchedProduct.unit}
                                </span>

                                {item.requiresReview && !selected && (
                                  <div className="flex items-center gap-1.5">
                                    {(lineQuantities[idx] ?? item.extractedQuantity) === item.extractedQuantity ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setSelectedItems((prev) => ({
                                            ...prev,
                                            [idx]: {
                                              productId: item.matchedProduct!.productId,
                                              quantity: item.extractedQuantity,
                                            },
                                          }))
                                        }
                                        className="h-7 text-xs border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                                        data-testid={`accept-unit-${idx}`}
                                      >
                                        Accept {item.extractedQuantity} {item.matchedProduct.unit.toLowerCase()}
                                      </Button>
                                    ) : (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setSelectedItems((prev) => ({
                                            ...prev,
                                            [idx]: {
                                              productId: item.matchedProduct!.productId,
                                              quantity: lineQuantities[idx] ?? item.extractedQuantity,
                                            },
                                          }))
                                        }
                                        className="h-7 text-xs border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                                        data-testid={`confirm-unit-${idx}`}
                                      >
                                        Confirm {lineQuantities[idx] ?? item.extractedQuantity} {item.matchedProduct.unit}
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {selected && (
                                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] py-0 px-2 gap-1 font-semibold">
                                    <Check className="h-3 w-3" />
                                    <span>Confirmed</span>
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-destructive font-medium border-t border-border/40 pt-2">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span>No direct SKU match found for &ldquo;{item.extractedProductName}&rdquo;.</span>
                            </div>
                          )}

                          {/* Alternatives */}
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
                                  className={`rounded-md px-2 py-0.5 border transition-all ${selected?.productId === alt.productId
                                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                                      : 'border-border hover:border-primary/40 text-muted-foreground'
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
                    <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                      <span className="font-semibold">Unmatched text:</span>
                      <ul className="list-inside list-disc mt-1 text-[11px]">
                        {extraction.unmatchedLines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-between border-t border-border/80 pt-3.5 mt-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setExtraction(null)
                  setIsOpen(false)
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>

              <div className="flex items-center gap-2">
                {extraction && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExtraction(null)
                      setSelectedItems({})
                    }}
                    className="h-8 text-xs"
                  >
                    Clear proposals
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={isPending || Object.keys(selectedItems).length === 0}
                  data-testid="ai-add-cart-btn"
                  className="gap-1.5 font-semibold shadow-2xs h-8 text-xs rounded-lg"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>
                    {isPending
                      ? 'Adding to Cart…'
                      : `Add Confirmed Items (${Object.keys(selectedItems).length})`}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
