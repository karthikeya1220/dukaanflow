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
import { Search } from 'lucide-react'

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

  return (
    <div className="min-h-screen bg-background">
      <StorefrontHeader email={user.email} cartCount={cartItemCount} active="catalogue" />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-6">
        {/* Page heading + assist entry */}
        <div className="flex flex-col justify-between gap-3 pb-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Retailer Portal</h1>
            <p className="text-sm text-muted-foreground">
              Catalogue pricing, indicative stock and schemes · {products.length}{' '}
              {products.length === 1 ? 'product' : 'products'}
            </p>
          </div>
          <AiOrderModal />
        </div>

        {/* Filter row — hairline, no card wrapper */}
        <form className="flex flex-wrap items-center gap-2 border-y border-border py-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <label className="sr-only" htmlFor="catalogue-search">
              Search catalogue
            </label>
            <input
              id="catalogue-search"
              name="q"
              defaultValue={query.q}
              placeholder="Search by SKU or product name"
              className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          <label className="sr-only" htmlFor="catalogue-stock">Stock filter</label>
          <select
            id="catalogue-stock"
            name="stock"
            defaultValue={query.stock}
            className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="all">All stock</option>
            <option value="in-stock">In stock</option>
            <option value="out-of-stock">Out of stock</option>
          </select>

          <label className="sr-only" htmlFor="catalogue-scheme">Scheme filter</label>
          <select
            id="catalogue-scheme"
            name="scheme"
            defaultValue={query.scheme}
            className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="all">All offers</option>
            <option value="with-scheme">With scheme</option>
          </select>

          <label className="sr-only" htmlFor="catalogue-unit">Selling unit filter</label>
          <select
            id="catalogue-unit"
            name="unit"
            defaultValue={query.unit}
            className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="all">All units</option>
            <option value="CASE">Case</option>
            <option value="PACK">Pack</option>
            <option value="PIECE">Piece</option>
          </select>

          <Button type="submit" size="sm" variant="outline" className="h-8">
            Filter
          </Button>
        </form>

        {/* Product grid */}
        <section aria-labelledby="catalogue-heading" className="mt-4">
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
