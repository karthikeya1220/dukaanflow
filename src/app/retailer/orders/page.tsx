import Link from 'next/link'
import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StorefrontHeader } from '@/components/storefront-header'
import { getOrdersForRetailer } from '@/lib/order-service'
import { formatPaise, formatOrderDateTime } from '@/lib/catalogue-format'

export const instant = false

const STATUS_STYLES: Record<string, string> = {
  APPROVED:
    'border-transparent bg-emerald-600 text-emerald-50',
  REJECTED:
    'border-destructive/30 bg-destructive/10 text-destructive',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`h-5 px-1.5 text-[10px] font-medium ${
        STATUS_STYLES[status] ?? 'border-border bg-muted text-muted-foreground'
      }`}
    >
      {status === 'SUBMITTED' ? 'IN REVIEW' : status}
    </Badge>
  )
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

  return (
    <div className="min-h-screen bg-background">
      <StorefrontHeader email={user.email} active="orders" />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-6">
        <div className="flex items-baseline justify-between gap-3 pb-4">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Order history</h1>
          <p className="text-xs text-muted-foreground">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground">No orders placed yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Commercial and simulation orders you submit will appear here with their
              review status and line snapshots.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/retailer">Browse catalogue</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {orders.map((order) => (
              <article key={order.id} className="rounded-md border border-border bg-card">
                {/* Order summary row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
                  <span className="font-mono text-xs font-medium text-foreground">
                    #{order.id.slice(0, 8)}
                  </span>
                  {order.isSimulation && (
                    <Badge
                      variant="outline"
                      className="h-5 border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                    >
                      SIMULATION
                    </Badge>
                  )}
                  <StatusBadge status={order.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatOrderDateTime(order.submittedAt)}
                  </span>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
                    {formatPaise(order.totalPaise)}
                  </span>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2 text-xs text-muted-foreground">
                  <span>
                    {order.lines.length} {order.lines.length === 1 ? 'line' : 'lines'}
                  </span>
                  <span>
                    Price basis:{' '}
                    <span className="font-medium text-foreground">
                      {order.priceBasisConfirmed ? 'confirmed' : 'provisional'}
                    </span>
                  </span>
                </div>

                {order.rejectionReason ? (
                  <div className="mx-4 mb-3 rounded-sm border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Rejection reason: {order.rejectionReason}
                  </div>
                ) : null}

                {/* Line snapshots */}
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Product</th>
                      <th className="px-2 py-2 font-medium">Paid</th>
                      <th className="px-2 py-2 font-medium">Free</th>
                      <th className="px-2 py-2 font-medium">Unit price</th>
                      <th className="px-4 py-2 text-right font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {order.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-2">
                          <span className="font-medium text-foreground">{line.productName}</span>
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {line.sku}
                          </span>
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {line.paidQty} {line.sellingUnit.toLowerCase()}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {line.freeQty > 0 ? (
                            <span className="font-medium text-primary">+{line.freeQty}</span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums">{formatPaise(line.unitPricePaise)}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums text-foreground">
                          {formatPaise(line.totalPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
