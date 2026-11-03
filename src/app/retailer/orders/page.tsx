import Link from 'next/link'
import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/actions/auth'
import { getOrdersForRetailer } from '@/lib/order-service'
import { formatPaise } from '@/lib/catalogue-format'
import { Store, LogOut, ArrowLeft, Clock, CheckCircle2, XCircle, Sparkles, Package, ShoppingBag } from 'lucide-react'

export const instant = false

export default async function RetailerOrdersPage() {
  const { user } = await requireRole('RETAILER')
  const currentUser = await getCurrentUserWithRole()
  const retailer = currentUser
    ? await prisma.user.findUnique({
        where: { authSubject: currentUser.user.id },
        select: { id: true },
      })
    : null

  const orders = retailer ? await getOrdersForRetailer(retailer.id) : []

  function getStatusBadge(status: string) {
    switch (status) {
      case 'APPROVED':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-[11px] font-semibold">
            <CheckCircle2 className="h-3 w-3" />
            <span>APPROVED</span>
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge variant="destructive" className="gap-1 text-[11px] font-semibold">
            <XCircle className="h-3 w-3" />
            <span>REJECTED</span>
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="gap-1 text-[11px] font-semibold">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>SUBMITTED</span>
          </Badge>
        )
    }
  }

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
              <Link href="/retailer">
                <ArrowLeft className="h-4 w-4" />
                <span>Catalogue</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 shadow-xs">
              <Link href="/retailer/cart">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <span>Cart</span>
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

      <main className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Order History</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review placed orders, status transitions, immutable snapshots, and simulated demo submissions.
            </p>
          </div>
          <Badge variant="secondary" className="self-start sm:self-auto font-mono text-xs">
            {orders.length} ORDER{orders.length === 1 ? '' : 'S'}
          </Badge>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
            <Package className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <h3 className="font-semibold text-base text-foreground">No orders placed yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              You haven&apos;t placed any commercial or simulation orders yet.
            </p>
            <Button asChild className="mt-5 h-9 font-medium shadow-xs">
              <Link href="/retailer">Browse Catalogue</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => (
              <article
                key={order.id}
                className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col gap-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-foreground">
                      Order #{order.id}
                    </span>
                    {order.isSimulation && (
                      <Badge variant="outline" className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-[11px] py-0 px-2">
                        <Sparkles className="h-3 w-3 mr-1 inline" />
                        SIMULATION
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(order.status)}
                    <span className="text-sm font-extrabold text-foreground">
                      {formatPaise(order.totalPaise)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Submitted: {new Date(order.submittedAt).toLocaleString()}</span>
                  <span>Price Basis: <strong className="text-foreground">{order.priceBasisConfirmed ? 'CONFIRMED' : 'PROVISIONAL'}</strong></span>
                </div>

                {/* Line items list */}
                <div className="rounded-xl border border-border/70 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 border-b border-border/70 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3">Paid Qty</th>
                        <th className="p-3">Free Qty</th>
                        <th className="p-3">Unit Price</th>
                        <th className="p-3 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {order.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="p-3">
                            <span className="font-medium text-foreground block">{l.productName}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{l.sku}</span>
                          </td>
                          <td className="p-3">{l.paidQty} {l.sellingUnit}</td>
                          <td className="p-3">
                            {l.freeQty > 0 ? (
                              <span className="font-bold text-emerald-600">+{l.freeQty}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="p-3">{formatPaise(l.unitPricePaise)}</td>
                          <td className="p-3 text-right font-semibold text-foreground">{formatPaise(l.totalPaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {order.rejectionReason && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                    <strong>Rejection reason:</strong> {order.rejectionReason}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

