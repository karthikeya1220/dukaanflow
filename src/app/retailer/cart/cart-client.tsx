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
import { CheckCircle2, AlertCircle } from 'lucide-react'

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
    <article className="flex flex-col gap-3 bg-card p-4 sm:flex-row sm:gap-6" aria-label={product?.name ?? 'Product'}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-medium text-foreground">{product?.name ?? 'Unknown product'}</h3>
          <span className="font-mono text-[11px] text-muted-foreground">{product?.sku ?? '—'}</span>
          {calculation?.stockStatus === 'OUT_OF_STOCK' && (
            <Badge variant="destructive" className="text-[10px] uppercase font-semibold">
              Out of stock
            </Badge>
          )}
        </div>

        {product && product.schemes && product.schemes.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {formatScheme(product.schemes[0], product.sellingUnit)}
          </p>
        )}

        {calculation ? (
          <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <div className="flex gap-1">
              <span>Paid: {quantity}</span>
            </div>
            <div className="flex gap-1">
              <dt>Unit price</dt>
              <dd className="font-medium tabular-nums text-foreground">{formatPaise(calculation.unitPricePaise)}</dd>
            </div>
            {calculation.freeQty > 0 && (
              <div className="flex gap-1">
                <dt className="text-primary font-medium">Free: {calculation.freeQty}</dt>
              </div>
            )}
            {calculation.discountPaise > 0 && (
              <div className="flex gap-1">
                <dt>Scheme discount</dt>
                <dd className="font-medium tabular-nums text-primary">-{formatPaise(calculation.discountPaise)}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt>Line net</dt>
              <dd className="font-medium tabular-nums text-foreground">{formatPaise(calculation.totalPaise)}</dd>
            </div>
          </dl>
        ) : null}

        {!line.unavailable &&
          calculation?.stockStatus !== 'AVAILABLE' &&
          calculation?.stockStatus &&
          calculation?.stockStatus !== 'OUT_OF_STOCK' && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>Stock is not sufficient for the paid and free quantities below.</span>
            </p>
          )}
      </div>

      {calculation && !line.unavailable && product ? (
        <div className="flex items-end gap-2 sm:flex-col sm:items-end sm:justify-end">
          <div className="flex flex-col gap-1">
            <label
              className="text-[11px] font-medium text-muted-foreground"
              htmlFor={`cart-quantity-${line.id}`}
            >
              Paid qty ({formatUnit(product.sellingUnit).toLowerCase()})
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
              className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => onUpdate(line.id, quantity)}
              disabled={disabled || line.unavailable || quantity === line.quantity}
            >
              Update quantity
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(line.id)}
              disabled={disabled}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className="text-xs text-destructive">
            This product is no longer available. Remove it before confirming the cart.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
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
  // Idempotency key must be stable across retries and double-clicks within one
  // confirm cycle — a timestamp per click would defeat idempotency. Regenerated
  // only after a successful submission (i.e. for the next cart cycle).
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
      <div className="mx-auto w-full max-w-3xl rounded-md border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">Unable to load cart. Please refresh the page.</p>
      </div>
    )
  }

  const hasBlockingLine = cart.lines.some(
    (line) => line.unavailable || line.calculation?.stockStatus !== 'AVAILABLE',
  )
  const hasPriceWarning = cart.calculation.hasUnconfirmedPriceBasis

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4" aria-labelledby="cart-heading">
      <div aria-live="polite">
        {feedback?.type === 'success' && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{feedback.message}</span>
          </div>
        )}
        {feedback?.type === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {submittedOrder && (
        <div
          data-testid="submitted-order-banner"
          className="rounded-md border border-border bg-muted/40 p-4 text-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">
                  {submittedOrder.isSimulation ? 'Simulation order created' : 'Order confirmed'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reference{' '}
                  <code data-testid="submitted-order-id" className="font-mono font-medium text-foreground">
                    {submittedOrder.id}
                  </code>{' '}
                  · Total{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatPaise(submittedOrder.totalPaise)}
                  </span>
                </p>
              </div>
            </div>
            {submittedOrder.isSimulation && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-[10px] font-medium text-amber-700 dark:text-amber-400"
              >
                SIMULATED
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Your cart
          </h1>
          <p className="text-sm text-muted-foreground">
            {cart.lines.length} {cart.lines.length === 1 ? 'line' : 'lines'} staged for ordering
          </p>
        </div>
        {cart.lines.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-destructive"
            onClick={() => mutate(clearCart, 'Cart cleared.')}
            disabled={isPending}
          >
            Clear cart
          </Button>
        )}
      </div>

      {cart.stale && (
        <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
          This cart was reopened because its price, scheme, unit, stock, or product data changed.
          Review it and confirm again.
        </div>
      )}

      {hasPriceWarning && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
          <p className="font-medium">Unconfirmed commercial price basis</p>
          <p className="mt-0.5">{PRICE_BASIS_WARNING}</p>
        </div>
      )}

      {cart.lines.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-16 text-center">
          <h3 className="text-sm font-medium text-foreground">Your cart is empty</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Add products from the catalogue, or describe the order in plain language with
            the natural-language assist.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/retailer">Browse catalogue</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col overflow-hidden rounded-md border border-border sm:divide-y divide-border">
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

          {/* Totals + confirmation */}
          <section className="rounded-md border border-border bg-card p-4" aria-labelledby="cart-total-heading">
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {formatPaise(cart.calculation.grossPaise)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">Scheme discounts</dt>
                <dd className="font-medium tabular-nums text-primary">
                  -{formatPaise(cart.calculation.discountPaise)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-border pt-2">
                <dt className="font-medium text-foreground">Provisional total</dt>
                <dd className="text-base font-semibold tabular-nums text-foreground">
                  {formatPaise(cart.calculation.totalPaise)}
                </dd>
              </div>
            </dl>

            {hasBlockingLine && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Confirmation is unavailable until every line is active and has enough
                  stock for paid and free quantities.
                </span>
              </div>
            )}

            {cart.status === 'CONFIRMED' ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={isPending || hasPriceWarning}
                    data-testid="submit-order-button"
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
                    {isPending ? 'Placing order…' : 'Place commercial order'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    data-testid="submit-simulation-order-button"
                    className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
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
                    Place simulation order
                  </Button>
                </div>

                {hasPriceWarning ? (
                  <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                    Commercial order is disabled: the catalogue price basis is unconfirmed and
                    commercial policy is pending approval. Simulation orders are priced from
                    real catalogue values, are clearly flagged as demo data, and no order in
                    this workflow changes distributor inventory.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Simulation orders exercise the end-to-end workflow without modifying
                    actual distributor inventory.
                  </p>
                )}
              </div>
            ) : (
              <Button
                type="button"
                className="mt-4 w-full sm:w-auto"
                onClick={() => mutate(confirmCart, 'Cart confirmed for the next stage.')}
                disabled={isPending || hasBlockingLine}
                data-testid="confirm-cart"
              >
                {isPending ? 'Checking current data…' : 'Confirm cart for next stage'}
              </Button>
            )}
          </section>
        </>
      )}
    </section>
  )
}
