import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { addCartProduct } from '@/app/actions/cart'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/actions/auth'
import { Badge } from '@/components/ui/badge'
import { CatalogueProducts } from './catalogue-client'
import { AiOrderModal } from './ai-order-modal'
import { getCartForRetailer } from '@/lib/cart-service'
import {
  getCatalogueProducts,
  parseCatalogueQuery,
} from '@/lib/catalogue'
import { Store, ShoppingBag, Search, Filter, LogOut, Package } from 'lucide-react'
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

  return (
    <div className="min-h-screen bg-muted/20 pb-16 font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-lg">DukaanFlow</span>
                <Badge variant="outline" className="border-primary/30 text-primary text-[10px] px-1.5 py-0 font-medium">
                  RETAILER
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 shadow-xs">
              <Link href="/retailer/orders">
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Orders</span>
              </Link>
            </Button>

            <Button asChild variant="outline" size="sm" className="relative h-9 gap-2 shadow-xs">
              <Link href="/retailer/cart">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <span className="font-medium">Cart</span>
                {cartItemCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                    {cartItemCount}
                  </span>
                )}
              </Link>
            </Button>

            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-muted-foreground hover:text-foreground"
                data-testid="logout-button"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-1.5">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Banner with Title and Quick Assist Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Retailer Portal</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Browse wholesale FMCG catalogue, live schemes, and order with instant AI translation.
            </p>
          </div>

          <div className="self-start sm:self-auto">
            <AiOrderModal />
          </div>
        </div>

        {/* Filter Bar */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <label className="sr-only" htmlFor="catalogue-search">
                Search catalogue
              </label>
              <input
                id="catalogue-search"
                name="q"
                defaultValue={query.q}
                placeholder="Search by SKU or product name"
                className="h-9 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>

            <div>
              <label className="sr-only" htmlFor="catalogue-stock">
                Stock filter
              </label>
              <select
                id="catalogue-stock"
                name="stock"
                defaultValue={query.stock}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="all">All stock</option>
                <option value="in-stock">In stock</option>
                <option value="out-of-stock">Out of stock</option>
              </select>
            </div>

            <div>
              <label className="sr-only" htmlFor="catalogue-scheme">
                Scheme filter
              </label>
              <select
                id="catalogue-scheme"
                name="scheme"
                defaultValue={query.scheme}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="all">All offers</option>
                <option value="with-scheme">With scheme</option>
              </select>
            </div>

            <div>
              <label className="sr-only" htmlFor="catalogue-unit">
                Selling unit filter
              </label>
              <select
                id="catalogue-unit"
                name="unit"
                defaultValue={query.unit}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="all">All units</option>
                <option value="CASE">Case</option>
                <option value="PACK">Pack</option>
                <option value="PIECE">Piece</option>
              </select>
            </div>

            <Button type="submit" size="sm" className="h-9 px-4 gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              <span>Filter</span>
            </Button>
          </form>
        </section>

        {/* Product Cards Grid */}
        <section aria-labelledby="catalogue-heading">
          <CatalogueProducts
            products={products}
            initialCartCount={cart?.lines.length ?? 0}
            addProductAction={addCartProduct}
          />
        </section>
      </main>
    </div>
  )
}
