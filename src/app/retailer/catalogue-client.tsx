'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatPaise, formatScheme, formatUnit } from '@/lib/catalogue-format'
import type { CartActionResult } from '@/app/actions/cart'
import { Minus, Plus, ShoppingCart, Check, AlertCircle, Package, Sparkles } from 'lucide-react'

type CatalogueProduct = {
  id: string
  sku: string
  name: string
  pricePaise: number
  priceBasis: 'UNCONFIRMED' | 'PER_PACK' | 'PER_CASE'
  packSize: number
  packUnit: 'PIECE' | 'PACK' | 'CASE'
  sellingUnit: 'PIECE' | 'PACK' | 'CASE'
  inventoryQty: number
  inventoryUnit: 'PIECE' | 'PACK' | 'CASE'
  schemes: Array<{
    id: string
    kind: 'BUY_X_GET_Y' | 'THRESHOLD_PERCENT'
    buyQty: number | null
    freeQty: number | null
    minQty: number | null
    discountBps: number | null
  }>
}

/** Linear-style quantity stepper: tactile 32px height, touch-safe, tabular numbers. */
function QuantityStepper({
  value,
  onChange,
  disabled,
  labelId,
}: {
  value: number
  onChange: (next: number) => void
  disabled: boolean
  labelId: string
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-border bg-background shadow-2xs">
      <button
        type="button"
        aria-label="Decrease quantity"
        className="flex h-9 w-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-30"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <label className="sr-only" htmlFor={labelId}>
        Quantity
      </label>
      <input
        id={labelId}
        type="number"
        min={1}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isInteger(next) && next > 0) onChange(next)
        }}
        className="h-9 w-11 border-x border-border bg-transparent text-center text-xs font-semibold tabular-nums outline-none [appearance:textfield] disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="Increase quantity"
        className="flex h-9 w-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-30"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function CatalogueProducts({
  products,
  addProductAction,
}: {
  products: CatalogueProduct[]
  initialCartCount?: number
  addProductAction: (input: unknown) => Promise<CartActionResult>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [isPending, startTransition] = useTransition()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    rootRef.current?.setAttribute('data-hydrated', 'true')
  }, [])

  function broadcastCartCount(count: number) {
    window.dispatchEvent(
      new CustomEvent('dukaanflow:cart-count', { detail: count }),
    )
  }

  function addProduct(productId: string, productName: string) {
    const quantity = quantities[productId] ?? 1
    setFeedback(null)
    setAddingId(productId)
    startTransition(async () => {
      try {
        const result: CartActionResult = await addProductAction({ productId, quantity })
        if (result.ok) {
          broadcastCartCount(result.cart.lines.length)
          setFeedback({ type: 'success', message: `${productName} added to cart.` })
        } else {
          setFeedback({ type: 'error', message: result.message })
        }
      } catch {
        setFeedback({ type: 'error', message: 'Unable to update the cart.' })
      } finally {
        setAddingId(null)
      }
    })
  }

  return (
    <div ref={rootRef} data-testid="catalogue-client" className="flex flex-col gap-4">
      {/* Dynamic Feedback Toast */}
      <div aria-live="polite" className="min-h-5 text-xs">
        {feedback?.type === 'success' && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-900 dark:text-emerald-200 animate-in fade-in-50">
            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">{feedback.message}</span>
            <Link
              href="/retailer/cart"
              className="ml-auto font-semibold text-emerald-700 dark:text-emerald-300 underline underline-offset-4 hover:text-emerald-800"
            >
              View cart &rarr;
            </Link>
          </div>
        )}
        {feedback?.type === 'error' && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive animate-in fade-in-50"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Package className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">No products match your filters</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Try clearing search keywords, adjusting the stock availability filter, or resetting unit criteria.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-5 rounded-lg shadow-2xs">
            <Link href="/retailer">Clear all filters</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const quantity = quantities[product.id] ?? 1
            const isOutOfStock = product.inventoryQty === 0
            const isLowStock = product.inventoryQty > 0 && product.inventoryQty <= 15
            const scheme = product.schemes[0]
            const isAdding = addingId === product.id && isPending

            return (
              <article
                key={product.sku}
                className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
              >
                <div>
                  {/* Top: Name & SKU Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground border border-border">
                      {product.sku}
                    </span>
                  </div>

                  {/* Pack Configuration & Stock Status */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium">
                      {product.packSize} {formatUnit(product.packUnit)} / {formatUnit(product.sellingUnit).toLowerCase()}
                    </span>
                    <span className="text-muted-foreground/30">•</span>
                    {isOutOfStock ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                        Out of stock
                      </span>
                    ) : isLowStock ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {product.inventoryQty} {formatUnit(product.inventoryUnit).toLowerCase()} left
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {product.inventoryQty} {formatUnit(product.inventoryUnit).toLowerCase()} in stock
                      </span>
                    )}
                  </div>

                  {/* Price Row */}
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-lg font-bold tabular-nums tracking-tight text-foreground">
                      {formatPaise(product.pricePaise)}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">
                      / {formatUnit(product.sellingUnit).toLowerCase()}
                    </span>
                    {product.priceBasis === 'UNCONFIRMED' && (
                      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300 border border-amber-500/30">
                        unconfirmed
                      </span>
                    )}
                  </div>

                  {/* Scheme Callout */}
                  <div className="mt-3 min-h-[30px]">
                    {scheme ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
                        <Sparkles className="h-3 w-3 shrink-0" />
                        <span>{formatScheme(scheme, product.sellingUnit)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Footer: Stepper + Add Button */}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <QuantityStepper
                    labelId={`quantity-${product.sku}`}
                    value={quantity}
                    onChange={(next) =>
                      setQuantities((current) => ({
                        ...current,
                        [product.id]: Number.isInteger(next) && next > 0 ? next : 1,
                      }))
                    }
                    disabled={isOutOfStock}
                  />

                  <Button
                    type="button"
                    size="sm"
                    variant={isOutOfStock ? 'outline' : 'default'}
                    className="h-9 min-w-[90px] font-semibold shadow-2xs gap-1.5"
                    onClick={() => addProduct(product.id, product.name)}
                    disabled={isPending || isOutOfStock}
                    data-testid={`add-to-cart-${product.sku}`}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span>{isAdding ? 'Adding…' : 'Add'}</span>
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
