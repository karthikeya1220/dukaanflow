'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  clearCart,
  confirmCart,
  createNewCart,
  getCurrentCart,
  removeCartLine,
  updateCartLine,
  type CartActionResult,
} from '@/app/actions/cart'
import { submitOrder, submitSimulationOrder } from '@/app/actions/order'
import { formatPaise, formatScheme, formatUnit } from '@/lib/catalogue-format'
import type { CartView, CartViewLine } from '@/lib/cart-service'
import Link from 'next/link'
import {
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Trash2,
  Sparkles,
  Info,
  Check
} from 'lucide-react'

const PRICE_BASIS_WARNING =
  'Provisional total: price basis is unconfirmed. Distributor confirmation is required before order submission.'

function messageForResult(result: CartActionResult): string {
  if (result.ok) return ''
  if (result.code === 'STALE_CART') {
    return 'This cart changed since confirmation. It has been reopened; review the current values before confirming again.'
  }
  return result.message
}

function CartLineCard({
  line,
  disabled,
  onUpdate,
  onRemove,
}: {
  line: CartViewLine
  disabled: boolean
  onUpdate: (lineId: string, quantity: number) => void
  onRemove: (lineId: string) => void
}) {
  const [quantity, setQuantity] = useState(line.quantity)
  const product = line.product
  const calculation = line.calculation

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all sm:flex-row sm:items-center sm:justify-between sm:gap-6 shadow-2xs"
      aria-label={product?.name ?? 'Product'}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">{product?.name ?? 'Unknown product'}</h3>
          <span className="font-mono text-[10px] text-muted-foreground border border-border bg-muted/50 px-1.5 py-0.5 rounded">
            {product?.sku ?? '—'}
          </span>
          {calculation?.stockStatus === 'OUT_OF_STOCK' && (
            <Badge variant="destructive" className="text-[10px] uppercase font-semibold">
              Out of stock
            </Badge>
          )}
        </div>

        {product && product.schemes && product.schemes.length > 0 && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-primary font-medium">
            <Sparkles className="h-3 w-3" />
            <span>{formatScheme(product.schemes[0], product.sellingUnit)}</span>
          </div>
        )}

        {calculation ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Rate: <span className="tabular-nums">{formatPaise(calculation.unitPricePaise)}</span> / {formatUnit(product?.sellingUnit ?? 'CASE').toLowerCase()}
            </span>
            <span className="text-muted-foreground/30">•</span>
            <span>Paid: <strong className="text-foreground">{quantity}</strong></span>
            {calculation.freeQty > 0 && (
              <>
                <span className="text-muted-foreground/30">•</span>
                <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary text-[11px]">
                  +{calculation.freeQty} Free Scheme
                </span>
              </>
            )}
            {calculation.discountPaise > 0 && (
              <>
                <span className="text-muted-foreground/30">•</span>
                <span className="font-semibold text-primary">
                  Discount: -{formatPaise(calculation.discountPaise)}
                </span>
              </>
            )}
            <span className="text-muted-foreground/30">•</span>
            <span className="font-semibold text-foreground">
              Total: <span className="tabular-nums">{formatPaise(calculation.totalPaise)}</span>
            </span>
          </div>
        ) : null}

        {!line.unavailable &&
          calculation?.stockStatus !== 'AVAILABLE' &&
          calculation?.stockStatus &&
          calculation?.stockStatus !== 'OUT_OF_STOCK' && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Insufficient stock for requested paid and free quantities.</span>
            </p>
          )}
      </div>

      {calculation && !line.unavailable && product ? (
        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2.5 sm:border-t-0 sm:pt-0 sm:justify-end">
          <div className="flex items-center gap-2">
            <label
              className="text-xs text-muted-foreground font-medium"
              htmlFor={`cart-quantity-${line.id}`}
            >
              Qty:
            </label>
            <input
              id={`cart-quantity-${line.id}`}
              type="number"
              min={1}
              step={1}
              value={quantity}
              disabled={disabled || line.unavailable}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isInteger(next) && next > 0) setQuantity(next)
              }}
              className="h-8 w-16 rounded-lg border border-input bg-background text-center text-xs font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium"
              onClick={() => onUpdate(line.id, quantity)}
              disabled={disabled || line.unavailable || quantity === line.quantity}
            >
              Update quantity
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
              onClick={() => onRemove(line.id)}
              disabled={disabled}
              title="Remove item"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className="text-xs text-destructive font-medium">
            Product no longer available in catalogue.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10 text-xs"
            onClick={() => onRemove(line.id)}
            disabled={disabled}
          >
            Remove unavailable line
          </Button>
        </div>
      )}
    </article>
  )
}

export function CartClient({ initialCart }: { initialCart: CartView | null }) {
  const [cart, setCart] = useState<CartView | null>(initialCart)
  const [isPending, startTransition] = useTransition()
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [submittedOrder, setSubmittedOrder] = useState<{
    id: string
    totalPaise: number
    isSimulation?: boolean
  } | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    initialCart?.stale
      ? {
        type: 'error',
        message: 'This cart was reopened because its data changed. Review it before confirming again.',
      }
      : null,
  )

  function loadCart() {
    startTransition(async () => {
      const result = await getCurrentCart()
      if (result.ok) {
        setCart(result.cart)
        if (result.stale) {
          setFeedback({ type: 'error', message: messageForResult({ ok: false, code: 'STALE_CART', message: '' }) })
        }
      } else {
        setFeedback({ type: 'error', message: result.message })
      }
    })
  }

  function applyResult(result: CartActionResult, successMessage?: string) {
    if (result.ok) {
      setCart(result.cart)
      setFeedback(successMessage ? { type: 'success', message: successMessage } : null)
      return
    }
    setFeedback({ type: 'error', message: messageForResult(result) })
    if (result.code === 'STALE_CART') loadCart()
  }

  function mutate(operation: () => Promise<CartActionResult>, successMessage?: string) {
    setFeedback(null)
    startTransition(async () => {
      const result = await operation()
      applyResult(result, successMessage)
    })
  }

  if (!cart) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-12 text-center shadow-xs">
        <p className="text-sm text-muted-foreground">Unable to load cart. Please refresh the page.</p>
      </div>
    )
  }

  const hasBlockingLine = cart.lines.some(
    (line) => line.unavailable || line.calculation?.stockStatus !== 'AVAILABLE',
  )
  const hasPriceWarning = cart.calculation.hasUnconfirmedPriceBasis

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6" aria-labelledby="cart-heading">
      {/* Toast Feedback */}
      <div aria-live="polite">
        {feedback?.type === 'success' && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200 shadow-2xs">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}
        {feedback?.type === 'error' && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive shadow-2xs"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}
      </div>

      {/* Submitted Order Success Banner */}
      {submittedOrder && (
        <div
          data-testid="submitted-order-banner"
          className="rounded-2xl border border-emerald-500/30 bg-card p-5 sm:p-6 shadow-sm animate-in fade-in-50"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 shadow-2xs">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground text-base">
                    {submittedOrder.isSimulation ? 'Simulation Order Created' : 'Order Confirmed'}
                  </h3>
                  {submittedOrder.isSimulation && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                    >
                      SIMULATED
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reference:{' '}
                  <code data-testid="submitted-order-id" className="font-mono font-semibold text-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                    {submittedOrder.id}
                  </code>{' '}
                  • Total Amount:{' '}
                  <span className="font-bold tabular-nums text-foreground">
                    {formatPaise(submittedOrder.totalPaise)}
                  </span>
                </p>
              </div>
            </div>

            <Button asChild size="sm" variant="outline" className="shadow-2xs text-xs font-semibold">
              <Link href="/retailer/orders">View in Order History &rarr;</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Your cart
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {cart.lines.length} {cart.lines.length === 1 ? 'line' : 'lines'} staged for distributor review
          </p>
        </div>
        {cart.lines.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => mutate(clearCart, 'Cart cleared.')}
            disabled={isPending}
          >
            Clear cart
          </Button>
        )}
      </div>

      {cart.stale && (
        <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
          This cart was reopened because product prices, trade schemes, units, or inventory data changed. Review lines before re-confirming.
        </div>
      )}

      {hasPriceWarning && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
          <p className="font-semibold flex items-center gap-1.5">
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            Unconfirmed commercial price basis
          </p>
          <p className="mt-1">{PRICE_BASIS_WARNING}</p>
        </div>
      )}

      {cart.lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">Your cart is empty</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Explore distributor products in the catalogue or use the Natural Language Assist to paste raw spoken or text orders.
          </p>
          <Button asChild size="sm" className="mt-5 font-semibold shadow-2xs">
            <Link href="/retailer">Browse catalogue</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Cart Items List (2 Columns on large screens) */}
          <div className="flex flex-col gap-3 lg:col-span-2">
            {cart.lines.map((line) => (
              <CartLineCard
                key={`${line.id}-${line.quantity}`}
                line={line}
                disabled={isPending}
                onUpdate={(lineId, quantity) =>
                  mutate(() => updateCartLine({ lineId, quantity }), 'Quantity updated.')
                }
                onRemove={(lineId) =>
                  mutate(() => removeCartLine({ lineId }), 'Product removed from cart.')
                }
              />
            ))}
          </div>

          {/* Right: Sticky Order Summary Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col gap-4">
              <div className="border-b border-border/80 pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Order Summary
                </h3>
                <span className="text-xs text-muted-foreground">
                  Status:{' '}
                  <strong className="text-foreground">
                    {cart.status === 'CONFIRMED' ? 'Confirmed (Ready)' : 'Active Draft'}
                  </strong>
                </span>
              </div>

              <dl className="flex flex-col gap-2.5 text-xs">
                <div className="flex items-baseline justify-between text-muted-foreground">
                  <dt>Gross Subtotal</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {formatPaise(cart.calculation.grossPaise)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between text-muted-foreground">
                  <dt>Scheme Discounts</dt>
                  <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    -{formatPaise(cart.calculation.discountPaise)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <dt className="text-sm font-bold text-foreground">Provisional Total</dt>
                  <dd className="text-lg font-extrabold tabular-nums text-foreground">
                    {formatPaise(cart.calculation.totalPaise)}
                  </dd>
                </div>
              </dl>

              {hasBlockingLine && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="flex items-start gap-1.5 font-semibold">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Action Required</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    Confirmation is unavailable until every line is active and has enough
                    stock for paid and free quantities.
                  </p>
                </div>
              )}

              {cart.status === 'CONFIRMED' ? (
                <div className="flex flex-col gap-2.5 border-t border-border/80 pt-3">
                  <Button
                    type="button"
                    disabled={isPending || hasPriceWarning}
                    data-testid="submit-order-button"
                    className="w-full font-semibold shadow-2xs text-xs h-9"
                    onClick={() => {
                      setFeedback(null)
                      startTransition(async () => {
                        const res = await submitOrder({ idempotencyKey })
                        if (res.ok) {
                          setSubmittedOrder({ id: res.order.id, totalPaise: res.order.totalPaise })
                          setFeedback({
                            type: 'success',
                            message: `Order #${res.order.id.slice(0, 8)} placed successfully!`,
                          })
                          setIdempotencyKey(crypto.randomUUID())
                          await createNewCart()
                          loadCart()
                        } else {
                          setFeedback({ type: 'error', message: res.message })
                        }
                      })
                    }}
                  >
                    {isPending ? 'Submitting…' : 'Place Commercial Order'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    data-testid="submit-simulation-order-button"
                    className="w-full border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 font-semibold text-xs h-9 shadow-2xs"
                    onClick={() => {
                      setFeedback(null)
                      startTransition(async () => {
                        const res = await submitSimulationOrder({ idempotencyKey })
                        if (res.ok) {
                          setSubmittedOrder({
                            id: res.order.id,
                            totalPaise: res.order.totalPaise,
                            isSimulation: true,
                          })
                          setFeedback({
                            type: 'success',
                            message: `[SIMULATION] Demo order #${res.order.id.slice(0, 8)} placed successfully!`,
                          })
                          setIdempotencyKey(crypto.randomUUID())
                          await createNewCart()
                          loadCart()
                        } else {
                          setFeedback({ type: 'error', message: res.message })
                        }
                      })
                    }}
                  >
                    Submit Simulation Order
                  </Button>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Simulation orders test full end-to-end routing without affecting distributor stock or commercial ERP exports.
                  </p>
                </div>
              ) : (
                <div className="border-t border-border/80 pt-3">
                  <Button
                    type="button"
                    className="w-full font-semibold shadow-2xs text-xs h-9"
                    onClick={() => mutate(confirmCart, 'Cart confirmed for the next stage.')}
                    disabled={isPending || hasBlockingLine}
                    data-testid="confirm-cart"
                  >
                    {isPending ? 'Verifying live data…' : 'Confirm Cart for Next Stage'}
                  </Button>
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    Freezes current price & scheme calculations for review.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
