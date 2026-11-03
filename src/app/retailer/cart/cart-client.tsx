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
import { submitOrder } from '@/app/actions/order'
import { formatPaise, formatScheme, formatUnit } from '@/lib/catalogue-format'
import type { CartView, CartViewLine } from '@/lib/cart-service'
import { ShoppingCart, ArrowLeft, Trash2, ShieldAlert, Sparkles, CheckCircle2, AlertCircle, Tag, Package } from 'lucide-react'
import Link from 'next/link'

const PRICE_BASIS_WARNING =
  'Provisional total: price basis is unconfirmed. Distributor confirmation is required before order submission.'

function messageForResult(result: CartActionResult): string {
  if (result.ok) return ''
  if (result.code === 'STALE_CART') {
    return 'This cart changed since confirmation. It has been reopened; review the current values before confirming again.'
  }
  return result.message
}

function StockStatus({ line }: { line: CartViewLine }) {
  if (!line.product || line.unavailable) {
    return <Badge variant="destructive">Inactive or unavailable</Badge>
  }
  if (line.calculation?.stockStatus === 'OUT_OF_STOCK') {
    return <Badge variant="destructive">Out of stock</Badge>
  }
  if (line.calculation?.stockStatus === 'INSUFFICIENT') {
    return <Badge variant="destructive">Insufficient stock</Badge>
  }
  return (
    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
      Available
    </Badge>
  )
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
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base text-foreground">{product?.name ?? 'Unavailable product'}</h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">{product?.sku ?? line.productId}</p>
        </div>
        <StockStatus line={line} />
      </div>
      {product && calculation ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2.5 rounded-lg bg-muted/40 p-3 text-xs border border-border/50 sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Unit price</dt>
              <dd className="font-semibold text-foreground mt-0.5">{formatPaise(calculation.unitPricePaise)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Price basis</dt>
              <dd className="font-medium text-foreground mt-0.5">{calculation.priceBasis.toLowerCase()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Indicative stock</dt>
              <dd className="font-medium text-foreground mt-0.5">{product.inventoryQty} {formatUnit(product.inventoryUnit)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Required qty</dt>
              <dd className="font-medium text-foreground mt-0.5">{calculation.requiredStockQty} {formatUnit(product.sellingUnit)}</dd>
            </div>
          </dl>

          <div className="mt-3.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <Tag className="h-3.5 w-3.5" />
              <span>Scheme breakdown</span>
            </div>
            {product.schemes.length > 0 ? (
              product.schemes.map((scheme) => (
                <p key={scheme.id} className="text-muted-foreground text-[11px] mt-1">
                  {formatScheme(scheme, product.sellingUnit)}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground text-[11px] mt-1">No active scheme</p>
            )}
            <p className="mt-2 text-foreground font-medium">
              Paid: <strong>{calculation.paidQty}</strong> · Free: <strong>{calculation.freeQty}</strong>
            </p>
          </div>

          <dl className="mt-3.5 grid grid-cols-3 gap-2.5 rounded-lg bg-muted/20 p-3 text-xs border border-border/40">
            <div>
              <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Subtotal</dt>
              <dd className="font-medium text-foreground mt-0.5">{formatPaise(calculation.grossPaise)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Discount</dt>
              <dd className="font-semibold text-emerald-600 mt-0.5">-{formatPaise(calculation.discountPaise)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Provisional total</dt>
              <dd className="font-bold text-sm text-foreground mt-0.5">{formatPaise(calculation.totalPaise)}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground" htmlFor={`cart-quantity-${line.id}`}>
                Paid quantity ({formatUnit(product.sellingUnit)})
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
                className="h-9 w-20 rounded-lg border border-input bg-transparent px-2.5 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => onUpdate(line.id, quantity)}
                disabled={disabled || line.unavailable || quantity === line.quantity}
              >
                Update quantity
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => onRemove(line.id)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Remove</span>
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            <span>This product is no longer available. Remove it before confirming the cart.</span>
          </p>
          <Button
            type="button"
            className="mt-3 h-8"
            size="sm"
            variant="destructive"
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
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card p-12 text-center shadow-xs">
        <Package className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Unable to load cart. Please refresh the page.</p>
      </div>
    )
  }

  const hasBlockingLine = cart.lines.some(
    (line) => line.unavailable || line.calculation?.stockStatus !== 'AVAILABLE',
  )
  const hasPriceWarning = cart.calculation.hasUnconfirmedPriceBasis

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-5" aria-labelledby="cart-heading">
      <div aria-live="polite" className="min-h-5 text-xs">
        {feedback?.type === 'success' && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}
        {feedback?.type === 'error' && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {submittedOrder && (
        <div
          data-testid="submitted-order-banner"
          className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm shadow-xs animate-in fade-in-50"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-primary">
                  {submittedOrder.isSimulation ? '⚡ Simulation Order Created' : '✓ Order Confirmed'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Order Reference: <code data-testid="submitted-order-id" className="font-mono font-bold text-foreground">{submittedOrder.id}</code> · Total: <span className="font-semibold text-foreground">{formatPaise(submittedOrder.totalPaise)}</span>
                </p>
              </div>
            </div>
            {submittedOrder.isSimulation && (
              <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-xs py-1 px-2">
                SIMULATED
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Cart Page Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground">
            <Link href="/retailer">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs font-medium">Back to Catalogue</span>
            </Link>
          </Button>
          <span className="text-muted-foreground">•</span>
          <div>
            <h2 id="cart-heading" className="text-lg font-bold tracking-tight text-foreground">Review cart</h2>
            <p className="text-xs text-muted-foreground">{cart.lines.length} line{cart.lines.length === 1 ? '' : 's'} staged for ordering</p>
          </div>
        </div>

        {cart.lines.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => mutate(clearCart, 'Cart cleared.')}
            disabled={isPending}
            className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear cart</span>
          </Button>
        )}
      </div>

      {cart.stale && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
          <strong>Notice:</strong> This cart was reopened because its price, scheme, unit, stock, or product data changed. Review it and confirm again.
        </div>
      )}

      {hasPriceWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xs">Unconfirmed Commercial Price Basis</p>
            <p className="mt-0.5">{PRICE_BASIS_WARNING}</p>
          </div>
        </div>
      )}

      {cart.lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground mb-3">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-base text-foreground">Your cart is empty</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Browse our distributor catalogue or use our AI natural language assist to quickly populate your order.
          </p>
          <Button asChild className="mt-5 h-9 font-medium shadow-xs">
            <a href="/retailer">Browse catalogue</a>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3.5">
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

          {/* Cart totals & confirmation */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs" aria-labelledby="cart-total-heading">
            <h3 id="cart-total-heading" className="font-bold text-base text-foreground">Cart totals</h3>
            
            <dl className="mt-4 grid gap-3 rounded-xl bg-muted/30 p-4 text-xs border border-border/50 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Subtotal</dt>
                <dd className="font-semibold text-foreground text-sm mt-0.5">{formatPaise(cart.calculation.grossPaise)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Total discount</dt>
                <dd className="font-semibold text-emerald-600 text-sm mt-0.5">-{formatPaise(cart.calculation.discountPaise)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Provisional total</dt>
                <dd className="font-extrabold text-foreground text-base mt-0.5">{formatPaise(cart.calculation.totalPaise)}</dd>
              </div>
            </dl>

            {hasBlockingLine && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Confirmation is unavailable until every line is active and has enough stock for paid and free quantities.</span>
              </div>
            )}

            {cart.status === 'CONFIRMED' ? (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 text-xs text-emerald-900 dark:text-emerald-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="font-bold text-sm text-foreground">
                    Cart is confirmed and ready for order submission.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5 mt-2">
                  <Button
                    type="button"
                    disabled={isPending || hasPriceWarning}
                    data-testid="submit-order-button"
                    className="h-10 font-medium shadow-xs"
                    onClick={() => {
                      setFeedback(null)
                      startTransition(async () => {
                        const key = `order-${cart.id}-${Date.now()}`
                        const res = await submitOrder({ idempotencyKey: key, isSimulation: false })
                        if (res.ok) {
                          setSubmittedOrder({ id: res.order.id, totalPaise: res.order.totalPaise })
                          setFeedback({
                            type: 'success',
                            message: `Order #${res.order.id.slice(0, 8)} placed successfully!`,
                          })
                          await createNewCart()
                          loadCart()
                        } else {
                          setFeedback({ type: 'error', message: res.message })
                        }
                      })
                    }}
                  >
                    {isPending ? 'Placing order…' : 'Place Commercial Order'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    data-testid="submit-simulation-order-button"
                    className="h-10 font-medium border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 shadow-xs"
                    onClick={() => {
                      setFeedback(null)
                      startTransition(async () => {
                        const key = `sim-order-${cart.id}-${Date.now()}`
                        const res = await submitOrder({ idempotencyKey: key, isSimulation: true })
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
                          await createNewCart()
                          loadCart()
                        } else {
                          setFeedback({ type: 'error', message: res.message })
                        }
                      })
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    <span>Place Demo / Simulation Order</span>
                  </Button>
                </div>

                {hasPriceWarning ? (
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                    * Commercial order is disabled: catalogue price basis is unconfirmed and commercial policy is pending approval. Simulation orders use synthetic demo values and do not change actual inventory.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Note: Simulation orders allow testing the end-to-end workflow without modifying actual distributor inventory.
                  </p>
                )}
              </div>
            ) : (
              <Button
                type="button"
                className="mt-5 w-full sm:w-auto h-10 font-medium shadow-xs"
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
