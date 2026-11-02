import { requireRole } from '@/lib/auth/require-role'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/actions/auth'
import { Badge } from '@/components/ui/badge'
import {
  formatPaise,
  formatScheme,
  formatUnit,
  getCatalogueProducts,
  parseCatalogueQuery,
} from '@/lib/catalogue'

export default async function RetailerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireRole('RETAILER')
  const query = parseCatalogueQuery(await searchParams)
  const products = await getCatalogueProducts(query)

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
        <div className="mb-3 flex items-center justify-between">
          <h2 id="catalogue-heading" className="text-lg font-semibold">
            Catalogue
          </h2>
          <p className="text-sm text-zinc-500">{products.length} products</p>
        </div>
        {products.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-zinc-500">
            No products match your filters.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {products.map((product) => (
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
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
