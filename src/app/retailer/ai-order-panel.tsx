'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { parseAiOrderText, applyAiItemsToCart } from '@/app/actions/ai-order'
import type {
  AiOrderExtractionResult,
  ParsedItemCandidate,
  ParsedOrderItem,
} from '@/lib/ai-order-parser'
import { InlineAlert } from '@/components/inline-alert'
import { InlineProgress } from '@/components/loading'
import {
  AlertTriangle,
  Check,
  CornerDownLeft,
  HelpCircle,
  Info,
  Sparkles,
} from 'lucide-react'

const FALLBACK_REASON_LABELS: Record<string, string> = {
  AI_MISSING_CREDENTIALS: 'AI is not configured on this deployment',
  AI_TIMEOUT: 'the AI request timed out',
  AI_RATE_LIMITED: 'the AI provider is rate-limited',
  AI_MALFORMED_RESPONSE: 'the AI service returned an unusable response',
  AI_PROVIDER_ERROR: 'the AI provider reported an error',
}

const SAMPLE_PROMPTS = [
  '2 carton britania biscuits aur 5 packet surf excel bhej do',
  '10 cases Parle-G, 4 boxes Maggi noodles',
  '5 peti Good Day butter cookies aur 3 dabba Tata Salt',
]

type Selection = { productId: string; quantity: number }

/**
 * AI order capture — the focused assistant surface.
 *
 * Contract with the business rules, all of which live in this component:
 *   - AI proposes mappings only. Nothing reaches the cart until the retailer
 *     explicitly confirms each line here.
 *   - Low-confidence, unit-ambiguous and unmatched lines are never
 *     pre-selected; they require an explicit "Accept/Confirm <qty> <unit>"
 *     action that states both the quantity and the selling unit.
 *   - Editing the quantity of a line awaiting review invalidates any
 *     confirmation already given for it.
 *   - When the provider is unavailable the deterministic engine answers, and
 *     the result is labelled as a rule-based fallback rather than AI.
 *   - The original retailer text is preserved verbatim and shown back as the
 *     source of every proposal.
 *
 * It never closes itself on a timer: the success message and the "View cart"
 * action stay put until the retailer acts on them.
 */
export function AiOrderPanel({ onCartUpdated }: { onCartUpdated?: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const [parsing, startParse] = useTransition()
  const [applying, startApply] = useTransition()
  const [extraction, setExtraction] = useState<AiOrderExtractionResult | null>(null)
  const [selections, setSelections] = useState<Record<number, Selection>>({})
  const [lineQuantities, setLineQuantities] = useState<Record<number, number>>({})
  const [alternatives, setAlternatives] = useState<Record<number, ParsedItemCandidate>>({})
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const busy = parsing || applying

  function handleParse() {
    const text = inputText.trim()
    if (!text || busy) return
    setFeedback(null)
    setExtraction(null)
    setSelections({})
    setAlternatives({})
    startParse(async () => {
      try {
        const result = await parseAiOrderText({ text })
        if (!result.ok) {
          setFeedback({ tone: 'error', message: result.message })
          return
        }
        const nextSelections: Record<number, Selection> = {}
        const nextQuantities: Record<number, number> = {}
        result.extraction.items.forEach((item, index) => {
          nextQuantities[index] = item.extractedQuantity
          // Only confident, unambiguous matches are pre-selected. Everything
          // else waits for an explicit human decision below.
          if (item.matchedProduct && !item.requiresReview) {
            nextSelections[index] = {
              productId: item.matchedProduct.productId,
              quantity: item.extractedQuantity,
            }
          }
        })
        setExtraction(result.extraction)
        setSelections(nextSelections)
        setLineQuantities(nextQuantities)
      } catch {
        setFeedback({
          tone: 'error',
          message: 'The request failed. Check your connection and try again.',
        })
      }
    })
  }

  function handleApply() {
    const items = Object.values(selections)
    if (items.length === 0 || busy) return
    setFeedback(null)
    startApply(async () => {
      try {
        const result = await applyAiItemsToCart({ items })
        if (!result.ok) {
          setFeedback({ tone: 'error', message: result.message })
          return
        }
        setFeedback({
          tone: 'success',
          message: `Added ${result.addedCount} items to your cart!`,
        })
        setExtraction(null)
        setSelections({})
        setInputText('')
        onCartUpdated?.()
        // Re-read the server-rendered cart count so the header badge follows.
        router.refresh()
      } catch {
        setFeedback({
          tone: 'error',
          message: 'Unable to update the cart. Check your connection and try again.',
        })
      }
    })
  }

  function changeQuantity(index: number, item: ParsedOrderItem, raw: string) {
    const next = Math.max(1, Math.floor(Number.parseInt(raw, 10) || 1))
    setLineQuantities((current) => ({ ...current, [index]: next }))
    if (item.requiresReview) {
      // Editing a line that still needs review withdraws any confirmation it
      // had — the quantity must be confirmed again, explicitly.
      setSelections((current) => {
        const copy = { ...current }
        delete copy[index]
        return copy
      })
      return
    }
    const productId = (alternatives[index] ?? item.matchedProduct)?.productId
    if (productId) {
      setSelections((current) => ({
        ...current,
        [index]: { productId, quantity: next },
      }))
    }
  }

  function confirmItem(index: number, item: ParsedOrderItem) {
    const target = alternatives[index] ?? item.matchedProduct
    if (!target) return
    setSelections((current) => ({
      ...current,
      [index]: {
        productId: target.productId,
        quantity: lineQuantities[index] ?? item.extractedQuantity,
      },
    }))
  }

  const matchedCount = extraction?.items.filter((item) => item.matchedProduct).length ?? 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 gap-2 px-3 sm:h-9"
          data-testid="ai-order-btn"
        >
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Order with Natural Language Assist
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-2 border-b border-border px-4 pb-3 pt-4 pr-11 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Order from a message
          </DialogTitle>
          <DialogDescription>
            Write the order the way you would say it. DukaanFlow proposes product matches —
            you confirm every SKU and quantity before anything reaches your cart.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
          {/* Source text. Always editable so a proposal can be corrected and
              re-read without leaving the assistant. */}
          <div className="flex flex-col gap-2">
            <label htmlFor="ai-order-input" className="text-sm font-medium text-foreground">
              Order text
            </label>
            <Textarea
              id="ai-order-input"
              data-testid="ai-order-input"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              rows={3}
              placeholder="e.g. 10 cases Parle-G, 5 peti Good Day cookies aur 3 packet Surf Excel"
              className="resize-none bg-background"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Units such as peti, carton and dabba are mapped to each SKU&apos;s pack rule.
              </p>
              <Button
                type="button"
                size="sm"
                className="h-11 gap-1.5 px-3 sm:h-9"
                onClick={handleParse}
                disabled={busy || !inputText.trim()}
                data-testid="ai-parse-btn"
              >
                {parsing ? 'Reading…' : 'Extract items'}
                <CornerDownLeft className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Worked examples, full-width targets on a phone, chips from sm up. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-xs text-muted-foreground sm:basis-full">
              Try an example:
            </span>
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInputText(prompt)}
                className="min-h-11 rounded-md border border-border bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground sm:min-h-8 sm:rounded-full"
              >
                &ldquo;{prompt}&rdquo;
              </button>
            ))}
          </div>

          {parsing ? (
            <InlineProgress label="Reading your order and matching products…" />
          ) : null}

          {feedback ? (
            <InlineAlert
              tone={feedback.tone === 'success' ? 'success' : 'error'}
              role={feedback.tone === 'success' ? 'status' : 'alert'}
              action={
                feedback.tone === 'success' ? (
                  <Button asChild variant="outline" size="sm" className="h-9">
                    <Link href="/retailer/cart">View cart</Link>
                  </Button>
                ) : undefined
              }
            >
              {feedback.message}
            </InlineAlert>
          ) : null}

          {/* Explicit labelling when the deterministic engine answered. */}
          {extraction?.engine === 'deterministic-fallback' ? (
            <InlineAlert
              tone="warning"
              role="status"
              data-testid="ai-fallback-notice"
              title={
                <>
                  AI service unavailable
                  {extraction.fallbackReason
                    ? ` — ${FALLBACK_REASON_LABELS[extraction.fallbackReason] ?? extraction.fallbackReason}`
                    : ''}
                </>
              }
            >
              <p>
                Suggestions below come from a rule-based helper, not AI. You can also order
                manually from the <Link href="/retailer" className="underline">catalogue</Link>.
              </p>
              {extraction.aiModel ? (
                <p className="mt-1 font-mono text-[11px] opacity-80">
                  model: {extraction.aiModel}
                </p>
              ) : null}
            </InlineAlert>
          ) : null}

          {extraction ? (
            <section aria-label="Proposed product mappings" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Proposed Product Mappings ({extraction.items.length})
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {matchedCount}/{extraction.items.length} matched
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Verify each SKU and quantity, then confirm — nothing is added automatically.
              </p>

              <ul className="flex flex-col gap-2.5">
                {extraction.items.map((item, index) => {
                  const selection = selections[index]
                  const chosen = alternatives[index] ?? item.matchedProduct
                  const quantity = lineQuantities[index] ?? item.extractedQuantity
                  const isUnchanged = quantity === item.extractedQuantity

                  return (
                    <li
                      key={index}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 basis-full text-xs text-muted-foreground sm:basis-auto">
                          Your words:{' '}
                          <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                            &ldquo;{item.rawLine}&rdquo;
                          </code>
                        </p>
                        {item.matchedProduct ? (
                          <Badge
                            variant="outline"
                            className={
                              item.requiresReview
                                ? 'border-warning/50 bg-warning-muted font-medium text-warning-foreground'
                                : 'font-medium'
                            }
                          >
                            {item.matchedProduct.confidence}% confidence
                            {item.requiresReview ? ' · needs review' : ''}
                          </Badge>
                        ) : null}
                      </div>

                      {chosen ? (
                        <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border pt-2.5">
                          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                            <p className="truncate text-sm font-medium text-foreground">
                              {chosen.name}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {chosen.sku}
                            </p>
                            {item.unitAmbiguous && item.clarificationPrompt ? (
                              <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-warning-foreground">
                                <AlertTriangle
                                  className="mt-0.5 size-3.5 shrink-0"
                                  aria-hidden="true"
                                />
                                {item.clarificationPrompt}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <label
                              htmlFor={`ai-quantity-${index}`}
                              className="text-xs text-muted-foreground"
                            >
                              Qty
                            </label>
                            <input
                              id={`ai-quantity-${index}`}
                              type="number"
                              min={1}
                              step={1}
                              value={quantity}
                              aria-label={`Quantity for ${chosen.name}`}
                              onChange={(event) => changeQuantity(index, item, event.target.value)}
                              className="h-11 w-16 rounded-md border border-input bg-card px-2 text-center text-sm font-medium tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:h-9"
                            />
                            <span className="text-xs font-medium uppercase text-muted-foreground">
                              {chosen.unit}
                            </span>

                            {item.requiresReview && !selection ? (
                              isUnchanged ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => confirmItem(index, item)}
                                  className="h-11 border-warning/50 bg-warning-muted text-warning-foreground sm:h-9"
                                  data-testid={`accept-unit-${index}`}
                                >
                                  Accept {item.extractedQuantity} {chosen.unit.toLowerCase()}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => confirmItem(index, item)}
                                  className="h-11 border-warning/50 bg-warning-muted text-warning-foreground sm:h-9"
                                  data-testid={`confirm-unit-${index}`}
                                >
                                  Confirm {quantity} {chosen.unit}
                                </Button>
                              )
                            ) : null}

                            {selection ? (
                              <span className="inline-flex h-11 items-center gap-1.5 rounded-md border border-success/40 bg-success/[0.08] px-2.5 text-xs font-medium text-success sm:h-9">
                                <Check className="size-3.5" aria-hidden="true" />
                                Confirmed
                              </span>
                            ) : null}

                            {selection && item.requiresReview ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setSelections((current) => {
                                    const copy = { ...current }
                                    delete copy[index]
                                    return copy
                                  })
                                }
                                className="h-11 px-2 text-muted-foreground sm:h-9"
                              >
                                Undo
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="flex items-start gap-1.5 border-t border-border pt-2.5 text-xs font-medium text-destructive">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          No direct SKU match for &ldquo;{item.extractedProductName}&rdquo; —
                          pick an alternative below or order it from the catalogue.
                        </p>
                      )}

                      {item.alternatives.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
                          <HelpCircle className="size-3.5 shrink-0" aria-hidden="true" />
                          <span>Alternatives:</span>
                          {item.alternatives.map((alternative) => {
                            const isActive = chosen?.productId === alternative.productId
                            return (
                              <button
                                key={alternative.productId}
                                type="button"
                                onClick={() => {
                                  setAlternatives((current) => ({
                                    ...current,
                                    [index]: alternative,
                                  }))
                                  // Picking a different SKU withdraws any
                                  // previous confirmation for this line.
                                  setSelections((current) => {
                                    const copy = { ...current }
                                    delete copy[index]
                                    return copy
                                  })
                                }}
                                aria-pressed={isActive}
                                className={
                                  isActive
                                    ? 'min-h-9 rounded-md border border-primary bg-accent px-2 py-1 font-medium text-accent-foreground'
                                    : 'min-h-9 rounded-md border border-border px-2 py-1 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                                }
                              >
                                {alternative.name} ({alternative.confidence}%)
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>

              {extraction.unmatchedLines.length > 0 ? (
                <InlineAlert tone="warning" title="Text we could not match">
                  <ul className="list-inside list-disc">
                    {extraction.unmatchedLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </InlineAlert>
              ) : null}
            </section>
          ) : null}
        </div>

        {/* The confirming action is pinned so it stays reachable regardless of
            how long the proposal list gets. */}
        {extraction ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 sm:px-5">
            <span className="mr-auto text-xs text-muted-foreground">
              {Object.keys(selections).length} of {extraction.items.length} lines confirmed
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 px-3 sm:h-9"
              onClick={() => {
                setExtraction(null)
                setSelections({})
                setFeedback(null)
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-11 gap-1.5 px-3 sm:h-9"
              onClick={handleApply}
              disabled={busy || Object.keys(selections).length === 0}
              data-testid="ai-add-cart-btn"
            >
              <Check className="size-4" aria-hidden="true" />
              {applying ? 'Adding to cart…' : 'Confirm & Add to Cart'}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
