'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatPaise, formatScheme, formatUnit } from '@/lib/catalogue-format'
import type { CartActionResult } from '@/app/actions/cart'
import { Minus, Plus, ShoppingCart } from 'lucide-react'

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

/** ecomcn-style stepper: compact, hairline, disabled when out of stock. */
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
    <div className="inline-flex h-8 items-center rounded-md border border-input bg-transparent">
      <button
        type="button"
        aria-label="Decrease quantity"
        className="flex h-8 w-8 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
        className="h-8 w-10 border-x border-input bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield] disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="Increase quantity"
        className="flex h-8 w-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
      }
    })
  }

  return (
    <div ref={rootRef} data-testid="catalogue-client" className="flex flex-col">
      <div aria-live="polite" className="min-h-5 text-xs">
        {feedback?.type === 'success' && (
          <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 p-2.5 text-muted-foreground">
            {feedback.message}
            <Link href="/retailer/cart" className="ml-auto font-medium text-foreground underline underline-offset-2">
              View cart
            </Link>
          </p>
        )}
        {feedback?.type === 'error' && (
          <p role="alert" className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-destructive">
            {feedback.message}
          </p>
        )}
      </div>

      {products.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">No products match your filters</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try clearing your search terms or widening the stock, scheme or unit filters.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/retailer">Reset filters</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-2 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const quantity = quantities[product.id] ?? 1
            const isOutOfStock = product.inventoryQty === 0
            const scheme = product.schemes[0]

            return (
              <article key={product.sku} className="flex flex-col justify-between bg-card p-4 transition-colors hover:bg-muted/15">
                <div>
                  <div className="flex items-start justify-between gap-2.5">
                    <h3 className="text-sm font-semibold leading-snug text-foreground">
                      {product.name}
                    </h3>
                    <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground border border-border/50">
                      {product.sku}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>
                      {product.packSize} {formatUnit(product.packUnit)} / {formatUnit(product.sellingUnit).toLowerCase()}
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    {isOutOfStock ? (
                      <span className="font-medium text-destructive">Out of stock</span>
                    ) : (
                      <span className="font-medium text-foreground/80">
                        {product.inventoryQty} {formatUnit(product.inventoryUnit).toLowerCase()} in stock
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-base font-bold tabular-nums text-foreground tracking-tight">
                      {formatPaise(product.pricePaise)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      / {formatUnit(product.sellingUnit).toLowerCase()}
                    </span>
                    {product.priceBasis === 'UNCONFIRMED' && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300 border border-amber-500/20">
                        unconfirmed
                      </span>
                    )}
                  </div>

                  {scheme ? (
                    <div className="mt-2.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary font-medium flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      <span>{formatScheme(scheme, product.sellingUnit)}</span>
                    </div>
                  ) : (
                    <div className="mt-2.5 h-6" aria-hidden="true" />
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
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
                    variant="outline"
                    className="h-8 min-w-24 font-medium"
                    onClick={() => addProduct(product.id, product.name)}
                    disabled={isPending}
                    data-testid={`add-to-cart-${product.sku}`}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span>{isPending ? 'Adding…' : 'Add'}</span>
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
