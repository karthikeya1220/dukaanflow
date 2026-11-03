'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { reviewOrder } from '@/app/actions/order'
import { formatPaise } from '@/lib/catalogue-format'
import type { OrderView } from '@/lib/order-service'

interface OrderDeskClientProps {
  initialOrders: OrderView[]
  reviewPolicyEnabled?: boolean
}

export function OrderDeskClient({
  initialOrders,
  reviewPolicyEnabled = false,
}: OrderDeskClientProps) {
  const [orders, setOrders] = useState<OrderView[]>(initialOrders)
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'COMMERCIAL' | 'SIMULATION'>('ALL')
  const [activeOrder, setActiveOrder] = useState<OrderView | null>(orders[0] || null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const filteredOrders = orders.filter((order) => {
    if (selectedStatus !== 'ALL' && order.status !== selectedStatus) return false
    if (typeFilter === 'COMMERCIAL' && order.isSimulation) return false
    if (typeFilter === 'SIMULATION' && !order.isSimulation) return false
    return true
  })

  function handleReview(orderId: string, status: 'APPROVED' | 'REJECTED') {
    setFeedback(null)
    startTransition(async () => {
      const res = await reviewOrder({ orderId, status })
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? res.order : o)))
        if (activeOrder?.id === orderId) {
          setActiveOrder(res.order)
        }
        setFeedback({
          type: 'success',
          message: `Order #${orderId.slice(0, 8)} successfully ${status.toLowerCase()}!`,
        })
      } else {
        setFeedback({ type: 'error', message: res.message })
      }
    })
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-emerald-600 hover:bg-emerald-700">APPROVED</Badge>
      case 'REJECTED':
        return <Badge variant="destructive">REJECTED</Badge>
      default:
        return <Badge variant="secondary">SUBMITTED</Badge>
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Policy Notice if disabled */}
      {!reviewPolicyEnabled && (
        <div
          role="note"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200"
        >
          <span className="font-semibold">Notice:</span> Order approvals and stock releases are currently disabled pending distributor operations policy approval. Orders can be inspected and monitored. Simulation orders are labelled with <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] py-0 px-1 inline-block">SIMULATED</Badge> and do not modify actual inventory or appear in commercial Tally exports.
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Status:</span>
            {(['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const).map((status) => (
              <Button
                key={status}
                size="sm"
                variant={selectedStatus === status ? 'default' : 'outline'}
                onClick={() => setSelectedStatus(status)}
                className="h-8 text-xs"
              >
                {status}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-l pl-3 dark:border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Kind:</span>
            <Button
              size="sm"
              variant={typeFilter === 'ALL' ? 'default' : 'outline'}
              onClick={() => setTypeFilter('ALL')}
              className="h-8 text-xs"
            >
              All
            </Button>
            <Button
              size="sm"
              variant={typeFilter === 'COMMERCIAL' ? 'default' : 'outline'}
              onClick={() => setTypeFilter('COMMERCIAL')}
              className="h-8 text-xs"
            >
              Commercial
            </Button>
            <Button
              size="sm"
              variant={typeFilter === 'SIMULATION' ? 'default' : 'outline'}
              onClick={() => setTypeFilter('SIMULATION')}
              className="h-8 text-xs"
            >
              Simulation
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="h-8 gap-2">
            <a href="/api/export/tally" download>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export Tally CSV (Commercial Only)
            </a>
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`rounded-lg p-3 text-sm ${
            feedback.type === 'error'
              ? 'border border-destructive/50 bg-destructive/10 text-destructive'
              : 'border border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Main Grid: Queue & Detail Pane */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Orders Queue (5 columns) */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-600 dark:text-zinc-400">
            Orders Queue ({filteredOrders.length})
          </h2>

          {filteredOrders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
              No orders found matching filter criteria.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredOrders.map((order) => {
                const isSelected = activeOrder?.id === order.id
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setActiveOrder(order)}
                    data-testid={`order-queue-item-${order.id}`}
                    className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-all ${
                      isSelected
                        ? 'border-zinc-900 bg-zinc-50/80 shadow-xs dark:border-zinc-100 dark:bg-zinc-900/80'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          #{order.id.slice(0, 8)}
                        </span>
                        {order.isSimulation && (
                          <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] py-0 px-1">
                            SIMULATED
                          </Badge>
                        )}
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium">{order.retailerEmail ?? 'Retailer'}</span>
                      <span className="text-sm font-semibold">{formatPaise(order.totalPaise)}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{order.lines.length} items</span>
                      <span>{new Date(order.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Order Detail & Actions (7 columns) */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          {activeOrder ? (
            <div className="flex flex-col gap-6 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 dark:border-zinc-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold tracking-tight">Order #{activeOrder.id}</h3>
                    {activeOrder.isSimulation && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">
                        SIMULATED ORDER
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Placed by {activeOrder.retailerEmail} on {new Date(activeOrder.submittedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(activeOrder.status)}
                  {activeOrder.status === 'SUBMITTED' && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={isPending || !reviewPolicyEnabled}
                        onClick={() => handleReview(activeOrder.id, 'APPROVED')}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        data-testid="order-approve-btn"
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending || !reviewPolicyEnabled}
                        onClick={() => handleReview(activeOrder.id, 'REJECTED')}
                        data-testid="order-reject-btn"
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Meta details */}
              <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <span className="text-zinc-500">Gross Total</span>
                  <p className="mt-1 font-semibold text-sm">{formatPaise(activeOrder.subtotalPaise)}</p>
                </div>
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <span className="text-zinc-500">Discount</span>
                  <p className="mt-1 font-semibold text-sm text-emerald-600">
                    -{formatPaise(activeOrder.discountPaise)}
                  </p>
                </div>
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <span className="text-zinc-500">Net Payable</span>
                  <p className="mt-1 font-bold text-sm">{formatPaise(activeOrder.totalPaise)}</p>
                </div>
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <span className="text-zinc-500">Price Basis</span>
                  <p className="mt-1 font-medium text-xs">
                    {activeOrder.priceBasisConfirmed ? 'CONFIRMED' : 'PROVISIONAL'}
                  </p>
                </div>
              </div>

              {/* Line items table */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Order Line Items
                </h4>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                      <tr>
                        <th className="p-3">Item / SKU</th>
                        <th className="p-3">Paid Qty</th>
                        <th className="p-3">Free Qty</th>
                        <th className="p-3">Unit Price</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {activeOrder.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="p-3">
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">{line.productName}</p>
                            <span className="text-zinc-400 font-mono">{line.sku}</span>
                          </td>
                          <td className="p-3">
                            {line.paidQty} {line.sellingUnit}
                          </td>
                          <td className="p-3">
                            {line.freeQty > 0 ? (
                              <span className="font-semibold text-emerald-600">+{line.freeQty}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="p-3">{formatPaise(line.unitPricePaise)}</td>
                          <td className="p-3 text-right font-medium">{formatPaise(line.totalPaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rejection notice if rejected */}
              {activeOrder.rejectionReason && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
                  <span className="font-semibold">Rejection Reason: </span>
                  {activeOrder.rejectionReason}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-800">
              Select an order from the queue to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
