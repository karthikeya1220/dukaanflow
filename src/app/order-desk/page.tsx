import { requireRole } from '@/lib/auth/require-role'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/actions/auth'
import { Badge } from '@/components/ui/badge'
import { getAllOrders, isOrderReviewPolicyEnabled } from '@/lib/order-service'
import { OrderDeskClient } from './order-desk-client'
import { Building2, LogOut, ShieldAlert } from 'lucide-react'

export const instant = false

export default async function OrderDeskPage() {
  const { user } = await requireRole('ORDER_DESK')
  const initialOrders = await getAllOrders()
  const reviewPolicyEnabled = isOrderReviewPolicyEnabled()

  return (
    <div className="min-h-screen bg-muted/20 pb-16 font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-lg">DukaanFlow</span>
                <Badge variant="outline" className="border-primary/30 text-primary text-[10px] px-1.5 py-0 font-medium">
                  ORDER DESK
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-2xs">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Queue Sync</span>
            </div>

            <form action={signOut}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="h-9 px-3 text-muted-foreground hover:text-foreground gap-1.5 shadow-xs"
                data-testid="logout-button"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Order Desk</h1>
              <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 bg-emerald-500/10 font-semibold text-xs">
                Live Operations
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Real-time distributor order queue, commercial audits, simulation isolation, and Tally ERP exports.
            </p>
          </div>

          {!reviewPolicyEnabled && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
              <span>Review gates & inventory release pending policy sign-off</span>
            </div>
          )}
        </div>

        <OrderDeskClient
          initialOrders={initialOrders}
          reviewPolicyEnabled={reviewPolicyEnabled}
        />
      </main>
    </div>
  )
}
