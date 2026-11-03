'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPaise, formatScheme, formatUnit } from '@/lib/catalogue-format'
import type { CartActionResult } from '@/app/actions/cart'
import { ShoppingCart, Package, Tag, AlertCircle, CheckCircle2, Boxes } from 'lucide-react'

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

export function CatalogueProducts({
  products,
  initialCartCount,
  addProductAction,
}: {
  products: CatalogueProduct[]
  initialCartCount: number
  addProductAction: (input: unknown) => Promise<CartActionResult>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [isPending, startTransition] = useTransition()
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [cartCount, setCartCount] = useState(initialCartCount)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    rootRef.current?.setAttribute('data-hydrated', 'true')
  }, [])

  function addProduct(productId: string, productName: string) {
    const quantity = quantities[productId] ?? 1
    setFeedback(null)
    startTransition(async () => {
      try {
        const result: CartActionResult = await addProductAction({ productId, quantity })
        if (result.ok) {
          setCartCount(result.cart.lines.length)
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
    <div ref={rootRef} data-testid="catalogue-client" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h2 id="catalogue-heading" className="text-lg font-bold tracking-tight text-foreground">
            Catalogue
          </h2>
          <p className="text-xs text-muted-foreground">Real-time distributor price basis & trade promotion schemes</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">{products.length} products available</span>
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 shadow-xs">
            <Link href="/retailer/cart" data-testid="cart-link">
              <ShoppingCart className="h-3.5 w-3.5 text-primary" />
              <span>Cart{cartCount === null ? '' : ` (${cartCount})`}</span>
            </Link>
          </Button>
        </div>
      </div>

      <div aria-live="polite" className="min-h-5 text-xs">
        {feedback?.type === 'success' && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}
        {feedback?.type === 'error' && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground mb-3">
            <Package className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">No products match your filters</h3>
          <p className="mt-1 text-xs text-muted-foreground">Try clearing your search terms or expanding your stock and scheme filters.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/retailer">Reset Filters</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const quantity = quantities[product.id] ?? 1
            const isOutOfStock = product.inventoryQty === 0

            return (
              <article
                key={product.sku}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-border/80 hover:shadow-sm"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                          {product.sku}
                        </span>
                        {product.priceBasis === 'UNCONFIRMED' && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            unconfirmed
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">
                        {product.name}
                      </h3>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] uppercase font-semibold">
                      {formatUnit(product.sellingUnit)}
                    </Badge>
                  </div>

                  {/* Attributes Details List */}
                  <dl className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-xs border border-border/50">
                    <div>
                      <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Price</dt>
                      <dd className="font-bold text-sm text-foreground mt-0.5">
                        {formatPaise(product.pricePaise)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Price basis</dt>
                      <dd className="font-medium text-foreground mt-0.5">
                        {product.priceBasis.toLowerCase()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Pack</dt>
                      <dd className="font-medium text-foreground mt-0.5">
                        {product.packSize} {formatUnit(product.packUnit)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">Stock</dt>
                      <dd className={`font-semibold mt-0.5 ${isOutOfStock ? 'text-destructive' : 'text-foreground'}`}>
                        {product.inventoryQty} {formatUnit(product.inventoryUnit)}
                      </dd>
                    </div>
                  </dl>

                  {/* Scheme Banner */}
                  {product.schemes.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-primary mb-1">
                        <Tag className="h-3.5 w-3.5" />
                        <span>Active Scheme</span>
                      </div>
                      {product.schemes.map((scheme) => (
                        <p key={scheme.id} className="text-muted-foreground text-[11px] leading-tight">
                          {formatScheme(scheme, product.sellingUnit)}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground py-1">
                      <Boxes className="h-3.5 w-3.5 opacity-60" />
                      <span className="text-[11px]">No active scheme</span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-5 border-t border-border/60 pt-4 flex items-end justify-between gap-3">
                  <div>
                    <label
                      className="mb-1 block text-[11px] font-medium text-muted-foreground"
                      htmlFor={`quantity-${product.sku}`}
                    >
                      Qty ({formatUnit(product.sellingUnit)})
                    </label>
                    <input
                      id={`quantity-${product.sku}`}
                      type="number"
                      min={1}
                      step={1}
                      value={quantity}
                      disabled={isOutOfStock}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setQuantities((current) => ({
                          ...current,
                          [product.id]: Number.isInteger(next) && next > 0 ? next : 1,
                        }))
                      }}
                      className="h-9 w-20 rounded-lg border border-input bg-transparent px-2.5 text-sm font-medium text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
                    />
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="h-9 font-medium shadow-xs gap-1.5 flex-1"
                    onClick={() => {
                      addProduct(product.id, product.name)
                    }}
                    disabled={isPending}
                    data-testid={`add-to-cart-${product.sku}`}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span>{isPending ? 'Adding…' : 'Add to cart'}</span>
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
