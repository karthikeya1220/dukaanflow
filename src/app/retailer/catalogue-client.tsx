'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPaise, formatScheme, formatUnit } from '@/lib/catalogue-format'
import type { CartActionResult } from '@/app/actions/cart'

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
    <div ref={rootRef} data-testid="catalogue-client">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="catalogue-heading" className="text-lg font-semibold">
          Catalogue
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-500">{products.length} products</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/retailer/cart" data-testid="cart-link">
              Cart{cartCount === null ? '' : ` (${cartCount})`}
            </Link>
          </Button>
        </div>
      </div>
      <div aria-live="polite" className="min-h-6 text-sm">
        {feedback?.type === 'success' && (
          <p className="text-emerald-700 dark:text-emerald-400">{feedback.message}</p>
        )}
        {feedback?.type === 'error' && (
          <p role="alert" className="text-destructive">{feedback.message}</p>
        )}
      </div>
      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-zinc-500">
          No products match your filters.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((product) => {
            const quantity = quantities[product.id] ?? 1
            return (
              <article
                key={product.sku}
                className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-sm text-zinc-500">{product.sku}</p>
                  </div>
                  <Badge variant="secondary">{formatUnit(product.sellingUnit)}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-zinc-500">Price</dt>
                    <dd className="font-medium">{formatPaise(product.pricePaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Price basis</dt>
                    <dd>{product.priceBasis.toLowerCase()}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Pack</dt>
                    <dd>
                      {product.packSize} {formatUnit(product.packUnit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Stock</dt>
                    <dd>
                      {product.inventoryQty} {formatUnit(product.inventoryUnit)}
                    </dd>
                  </div>
                </dl>
                {product.schemes.length > 0 ? (
                  <div className="mt-4 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
                    <p className="font-medium">Active scheme</p>
                    {product.schemes.map((scheme) => (
                      <p key={scheme.id} className="text-zinc-500">
                        {formatScheme(scheme, product.sellingUnit)}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-zinc-500">No active scheme</p>
                )}
                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium" htmlFor={`quantity-${product.sku}`}>
                      Quantity ({formatUnit(product.sellingUnit)})
                    </label>
                    <input
                      id={`quantity-${product.sku}`}
                      type="number"
                      min={1}
                      step={1}
                      value={quantity}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setQuantities((current) => ({
                          ...current,
                          [product.id]: Number.isInteger(next) && next > 0 ? next : 1,
                        }))
                      }}
                      className="h-9 w-24 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      addProduct(product.id, product.name)
                    }}
                    disabled={isPending}
                    data-testid={`add-to-cart-${product.sku}`}
                  >
                    {isPending ? 'Adding…' : 'Add to cart'}
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
