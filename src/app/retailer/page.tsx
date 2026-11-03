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

  return (
    <main className="flex flex-1 flex-col p-8 max-w-2xl mx-auto gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Retailer Portal</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">RETAILER</Badge>
          <form action={signOut}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              data-testid="logout-button"
            >
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {/* AI Quick Order Assist */}
      <AiOrderModal />

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <form className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <label className="sr-only" htmlFor="catalogue-search">
            Search catalogue
          </label>
          <input
            id="catalogue-search"
            name="q"
            defaultValue={query.q}
            placeholder="Search by SKU or product name"
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          />
          <label className="sr-only" htmlFor="catalogue-stock">
            Stock filter
          </label>
          <select
            id="catalogue-stock"
            name="stock"
            defaultValue={query.stock}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">All stock</option>
            <option value="in-stock">In stock</option>
            <option value="out-of-stock">Out of stock</option>
          </select>
          <label className="sr-only" htmlFor="catalogue-scheme">
            Scheme filter
          </label>
          <select
            id="catalogue-scheme"
            name="scheme"
            defaultValue={query.scheme}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">All offers</option>
            <option value="with-scheme">With scheme</option>
          </select>
          <label className="sr-only" htmlFor="catalogue-unit">
            Selling unit filter
          </label>
          <select
            id="catalogue-unit"
            name="unit"
            defaultValue={query.unit}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">All units</option>
            <option value="CASE">Case</option>
            <option value="PACK">Pack</option>
            <option value="PIECE">Piece</option>
          </select>
          <Button type="submit">Filter</Button>
        </form>
      </section>

      <section aria-labelledby="catalogue-heading">
        <CatalogueProducts
          products={products}
          initialCartCount={cart?.lines.length ?? 0}
          addProductAction={addCartProduct}
        />
      </section>
    </main>
  )
}
