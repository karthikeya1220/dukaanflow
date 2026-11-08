import { requireRole } from '@/lib/auth/require-role'
import { AppHeader } from '@/components/app-header'
import { PageHeader } from '@/components/page-header'
import { InlineAlert } from '@/components/inline-alert'
import { Button } from '@/components/ui/button'
import { getAllOrders, isOrderReviewPolicyEnabled } from '@/lib/order-service'
import { OrderDeskClient } from './order-desk-client'
import { Download } from 'lucide-react'

export const instant = false

export default async function OrderDeskPage() {
  const { user } = await requireRole('ORDER_DESK')
  const initialOrders = await getAllOrders()
  const reviewPolicyEnabled = isOrderReviewPolicyEnabled()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader email={user.email} context="Order desk" />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 lg:px-6">
        <PageHeader
          title="Order Desk"
          description="Distributor order queue, review status, simulation isolation and Tally ERP export."
          action={
            <Button asChild size="sm" className="h-11 gap-1.5 px-3 sm:h-9">
              <a href="/api/export/tally" download>
                <Download className="size-3.5" aria-hidden="true" />
                Export Tally CSV
              </a>
            </Button>
          }
        />

        {!reviewPolicyEnabled ? (
          <InlineAlert
            role="note"
            tone="warning"
            className="mt-5"
            title="Review gates pending policy sign-off"
          >
            <p>
              Order approvals and stock releases are currently disabled pending distributor
              operations policy approval. Orders can be inspected and monitored. Simulation
              orders are labelled <strong className="font-semibold">SIMULATED</strong>, never
              modify actual inventory, and never appear in commercial Tally exports.
            </p>
          </InlineAlert>
        ) : null}

        <div className="mt-6">
          <OrderDeskClient
            initialOrders={initialOrders}
            reviewPolicyEnabled={reviewPolicyEnabled}
          />
        </div>
      </main>
    </div>
  )
}
