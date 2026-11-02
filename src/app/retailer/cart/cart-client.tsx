'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  clearCart,
  confirmCart,
  getCurrentCart,
  removeCartLine,
  updateCartLine,
  type CartActionResult,
} from '@/app/actions/cart'
import { formatPaise, formatScheme, formatUnit } from '@/lib/catalogue-format'
import type { CartView, CartViewLine } from '@/lib/cart-service'

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
  return <Badge variant="secondary">Available</Badge>
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
    <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{product?.name ?? 'Unavailable product'}</h2>
          <p className="text-sm text-zinc-500">{product?.sku ?? line.productId}</p>
        </div>
        <StockStatus line={line} />
      </div>
      {product && calculation ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-zinc-500">Unit price</dt>
              <dd>{formatPaise(calculation.unitPricePaise)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Price basis</dt>
              <dd>{calculation.priceBasis.toLowerCase()}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Current stock</dt>
              <dd>{product.inventoryQty} {formatUnit(product.inventoryUnit)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Required stock</dt>
              <dd>{calculation.requiredStockQty} {formatUnit(product.sellingUnit)}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
            <p className="font-medium">Scheme</p>
            {product.schemes.length > 0 ? (
              product.schemes.map((scheme) => (
                <p key={scheme.id} className="text-zinc-500">
                  {formatScheme(scheme, product.sellingUnit)}
                </p>
              ))
            ) : (
              <p className="text-zinc-500">No active scheme</p>
            )}
            <p className="mt-2">
              Paid: <strong>{calculation.paidQty}</strong> · Free: <strong>{calculation.freeQty}</strong>
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-zinc-500">Subtotal</dt>
              <dd>{formatPaise(calculation.grossPaise)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Discount</dt>
              <dd>{formatPaise(calculation.discountPaise)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Provisional total</dt>
              <dd className="font-semibold">{formatPaise(calculation.totalPaise)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor={`cart-quantity-${line.id}`}>
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
                className="h-9 w-24 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onUpdate(line.id, quantity)}
              disabled={disabled || line.unavailable || quantity === line.quantity}
            >
              Update quantity
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => onRemove(line.id)}
              disabled={disabled}
            >
              Remove
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-destructive">
            This product is no longer available. Remove it before confirming the cart.
          </p>
          <Button
            type="button"
            className="mt-3"
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
    return <p className="mx-auto w-full max-w-4xl text-sm text-zinc-500">Unable to load cart.</p>
  }

  const hasBlockingLine = cart.lines.some(
    (line) => line.unavailable || line.calculation?.stockStatus !== 'AVAILABLE',
  )
  const hasPriceWarning = cart.calculation.hasUnconfirmedPriceBasis

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4" aria-labelledby="cart-heading">
      <div aria-live="polite" className="min-h-6 text-sm">
        {feedback?.type === 'success' && (
          <p className="text-emerald-700 dark:text-emerald-400">{feedback.message}</p>
        )}
        {feedback?.type === 'error' && <p role="alert" className="text-destructive">{feedback.message}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cart-heading" className="text-lg font-semibold">Review cart</h2>
          <p className="text-sm text-zinc-500">{cart.lines.length} line{cart.lines.length === 1 ? '' : 's'}</p>
        </div>
        {cart.lines.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => mutate(clearCart, 'Cart cleared.')}
            disabled={isPending}
          >
            Clear cart
          </Button>
        )}
      </div>
      {cart.stale && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This cart was reopened because its price, scheme, unit, stock, or product data changed. Review it and confirm again.
        </div>
      )}
      {hasPriceWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {PRICE_BASIS_WARNING}
        </div>
      )}
      {cart.lines.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h3 className="font-semibold">Your cart is empty</h3>
          <p className="mt-1 text-sm text-zinc-500">Choose products from the catalogue to get started.</p>
          <Button asChild className="mt-4">
            <a href="/retailer">Browse catalogue</a>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
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
          <section className="rounded-lg border p-4" aria-labelledby="cart-total-heading">
            <h3 id="cart-total-heading" className="font-semibold">Cart totals</h3>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-zinc-500">Subtotal</dt>
                <dd>{formatPaise(cart.calculation.grossPaise)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Total discount</dt>
                <dd>{formatPaise(cart.calculation.discountPaise)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Provisional total</dt>
                <dd className="font-semibold">{formatPaise(cart.calculation.totalPaise)}</dd>
              </div>
            </dl>
            {hasBlockingLine && (
              <p className="mt-4 text-sm text-destructive">
                Confirmation is unavailable until every line is active and has enough stock for paid and free quantities.
              </p>
            )}
            {cart.status === 'CONFIRMED' ? (
              <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                Cart confirmed for the next stage. No order or inventory reservation was created.
              </p>
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
