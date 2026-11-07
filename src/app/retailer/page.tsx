import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { addCartProduct } from '@/app/actions/cart'
import { Button } from '@/components/ui/button'
import { StorefrontHeader } from '@/components/storefront-header'
import { CatalogueProducts } from './catalogue-client'
import { AiOrderModal } from './ai-order-modal'
import { getCartForRetailer } from '@/lib/cart-service'
import {
  getCatalogueProducts,
  parseCatalogueQuery,
} from '@/lib/catalogue'
import { Search, SlidersHorizontal, RotateCcw } from 'lucide-react'
import Link from 'next/link'

export const instant = false

export default async function RetailerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireRole('RETAILER')
  const query = parseCatalogueQuery(await searchParams)
  const products = await getCatalogueProducts(query)
  const currentUser = await getCurrentUserWithRole()
  const retailer = currentUser
    ? await prisma.user.findUnique({
      where: { authSubject: currentUser.user.id },
      select: { id: true },
    })
    : null
  const cart = retailer ? (await getCartForRetailer(retailer.id)).view : null
  const cartItemCount = cart?.lines.length ?? 0

  const hasActiveFilters = Boolean(
    query.q ||
    query.stock !== 'all' ||
    query.scheme !== 'all' ||
    query.unit !== 'all'
  )

  return (
    <div className="min-h-screen bg-muted/15 font-sans">
      <StorefrontHeader email={user.email} cartCount={cartItemCount} active="catalogue" />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8 lg:px-6">
        {/* Page heading + assist entry */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Retailer Portal
              </h1>
              <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {products.length} {products.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Distributor trade catalogue with verified pack rules, active schemes, and live stock indicator.
            </p>
          </div>
          <div className="shrink-0">
            <AiOrderModal />
          </div>
        </div>

        {/* Filter Toolbar */}
        <section aria-label="Catalogue filters" className="mt-6">
          <form className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-2xs">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <label className="sr-only" htmlFor="catalogue-search">
                Search catalogue
              </label>
              <input
                id="catalogue-search"
                name="q"
                defaultValue={query.q}
                placeholder="Search by SKU, brand, or product name..."
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="catalogue-stock">
                Stock filter
              </label>
              <select
                id="catalogue-stock"
                name="stock"
                defaultValue={query.stock}
                className="h-9 rounded-lg border border-input bg-background px-3 text-xs sm:text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="all">All stock</option>
                <option value="in-stock">In stock only</option>
                <option value="out-of-stock">Out of stock</option>
              </select>

              <label className="sr-only" htmlFor="catalogue-scheme">
                Scheme filter
              </label>
              <select
                id="catalogue-scheme"
                name="scheme"
                defaultValue={query.scheme}
                className="h-9 rounded-lg border border-input bg-background px-3 text-xs sm:text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="all">All trade schemes</option>
                <option value="with-scheme">Active schemes only</option>
              </select>

              <label className="sr-only" htmlFor="catalogue-unit">
                Selling unit filter
              </label>
              <select
                id="catalogue-unit"
                name="unit"
                defaultValue={query.unit}
                className="h-9 rounded-lg border border-input bg-background px-3 text-xs sm:text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="all">All units</option>
                <option value="CASE">Case</option>
                <option value="PACK">Pack</option>
                <option value="PIECE">Piece</option>
              </select>

              <Button type="submit" size="sm" variant="secondary" className="h-9 gap-1.5 font-medium">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filter</span>
              </Button>

              {hasActiveFilters && (
                <Button asChild size="sm" variant="ghost" className="h-9 gap-1 text-muted-foreground hover:text-foreground">
                  <Link href="/retailer">
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </Link>
                </Button>
              )}
            </div>
          </form>
        </section>

        {/* Product grid */}
        <section aria-labelledby="catalogue-heading" className="mt-6">
          <h2 id="catalogue-heading" className="sr-only">
            Products
          </h2>
          <CatalogueProducts
            products={products}
            initialCartCount={cartItemCount}
            addProductAction={addCartProduct}
          />
        </section>
      </main>
    </div>
  )
}
