import { requireRole } from '@/lib/auth/require-role'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/actions/auth'
import { Badge } from '@/components/ui/badge'
import { getAllOrders, isOrderReviewPolicyEnabled } from '@/lib/order-service'
import { OrderDeskClient } from './order-desk-client'

export const instant = false

export default async function OrderDeskPage() {
  const { user } = await requireRole('ORDER_DESK')
  const initialOrders = await getAllOrders()
  const reviewPolicyEnabled = isOrderReviewPolicyEnabled()

  return (
    <main className="flex flex-1 flex-col p-4 sm:p-8 max-w-7xl mx-auto gap-6 w-full">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Order Desk</h1>
            <Badge variant="outline" className="border-emerald-600/30 text-emerald-600 bg-emerald-500/10">
              Live Approvals
            </Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">ORDER DESK</Badge>
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

      <OrderDeskClient
        initialOrders={initialOrders}
        reviewPolicyEnabled={reviewPolicyEnabled}
      />
    </main>
  )
}
