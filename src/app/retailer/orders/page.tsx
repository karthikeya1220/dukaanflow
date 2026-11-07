import Link from 'next/link'
import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StorefrontHeader } from '@/components/storefront-header'
import { getOrdersForRetailer } from '@/lib/order-service'
import { getCartForRetailer } from '@/lib/cart-service'
import { formatPaise, formatOrderDateTime } from '@/lib/catalogue-format'
import { Clock, CheckCircle2, XCircle, AlertCircle, ShoppingBag } from 'lucide-react'

export const instant = false

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'APPROVED':
      return (
        <Badge className="border-transparent bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-[10px] font-semibold">
          <CheckCircle2 className="h-3 w-3" />
          <span>APPROVED</span>
        </Badge>
      )
    case 'REJECTED':
      return (
        <Badge variant="destructive" className="gap-1 text-[10px] font-semibold">
          <XCircle className="h-3 w-3" />
          <span>REJECTED</span>
        </Badge>
      )
    default:
      return (
        <Badge variant="secondary" className="gap-1 text-[10px] font-semibold text-muted-foreground border-border">
          <Clock className="h-3 w-3" />
          <span>IN REVIEW</span>
        </Badge>
      )
  }
}

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
  const cart = retailer ? (await getCartForRetailer(retailer.id)).view : null
  const cartItemCount = cart?.lines.length ?? 0

  return (
    <div className="min-h-screen bg-muted/15 font-sans">
      <StorefrontHeader email={user.email} cartCount={cartItemCount} active="orders" />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8 lg:px-6">
        {/* Header */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between pb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Order history</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Track status, line items, and audit records of your submitted orders.
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} recorded
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">No orders placed yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Commercial and simulation orders you submit will appear here with live review statuses and line snapshots.
            </p>
            <Button asChild size="sm" className="mt-5 font-semibold shadow-2xs">
              <Link href="/retailer">Browse catalogue</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => (
              <article
                key={order.id}
                className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden transition-all duration-200 hover:border-primary/30 hover:shadow-xs"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border">
                      #{order.id.slice(0, 8)}
                    </span>
                    {order.isSimulation && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                      >
                        SIMULATION
                      </Badge>
                    )}
                    <StatusBadge status={order.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatOrderDateTime(order.submittedAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Total:</span>
                    <span className="text-base font-bold tabular-nums text-foreground">
                      {formatPaise(order.totalPaise)}
                    </span>
                  </div>
                </div>

                {/* Metadata details */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-2 sm:px-5 text-xs text-muted-foreground bg-background">
                  <div className="flex items-center gap-3">
                    <span>
                      {order.lines.length} {order.lines.length === 1 ? 'line item' : 'line items'}
                    </span>
                    <span className="text-muted-foreground/30">•</span>
                    <span>
                      Price basis:{' '}
                      <strong className="text-foreground capitalize">
                        {order.priceBasisConfirmed ? 'Confirmed' : 'Provisional'}
                      </strong>
                    </span>
                  </div>
                </div>

                {order.rejectionReason && (
                  <div className="mx-4 sm:mx-5 my-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Rejection reason: {order.rejectionReason}</span>
                  </div>
                )}

                {/* Line items table / cards on mobile */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border/60 bg-muted/10 text-muted-foreground">
                      <tr>
                        <th className="px-4 sm:px-5 py-2.5 font-semibold">Product</th>
                        <th className="px-3 py-2.5 font-semibold">Paid Qty</th>
                        <th className="px-3 py-2.5 font-semibold">Free Qty</th>
                        <th className="px-3 py-2.5 font-semibold">Rate</th>
                        <th className="px-4 sm:px-5 py-2.5 text-right font-semibold">Line Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {order.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 sm:px-5 py-2.5">
                            <span className="font-semibold text-foreground">{line.productName}</span>
                            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                              {line.sku}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-foreground font-medium">
                            {line.paidQty} {line.sellingUnit.toLowerCase()}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {line.freeQty > 0 ? (
                              <span className="font-semibold text-primary">+{line.freeQty} free</span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                            {formatPaise(line.unitPricePaise)}
                          </td>
                          <td className="px-4 sm:px-5 py-2.5 text-right font-semibold tabular-nums text-foreground">
                            {formatPaise(line.totalPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
