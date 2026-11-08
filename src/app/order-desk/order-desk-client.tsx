'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { reviewOrder } from '@/app/actions/order'
import { formatPaise, formatOrderDateTime, formatOrderTime } from '@/lib/catalogue-format'
import type { OrderView } from '@/lib/order-service'
import {
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  AlertCircle,
  ShieldAlert,
  Search,
  Check,
  Ban,
  Layers,
  Sparkles
} from 'lucide-react'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [activeOrder, setActiveOrder] = useState<OrderView | null>(orders[0] || null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const filteredOrders = orders.filter((order) => {
    if (selectedStatus !== 'ALL' && order.status !== selectedStatus) return false
    if (typeFilter === 'COMMERCIAL' && order.isSimulation) return false
    if (typeFilter === 'SIMULATION' && !order.isSimulation) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchId = order.id.toLowerCase().includes(q)
      const matchEmail = (order.retailerEmail ?? '').toLowerCase().includes(q)
      const matchSku = order.lines.some(l => l.sku.toLowerCase().includes(q) || l.productName.toLowerCase().includes(q))
      if (!matchId && !matchEmail && !matchSku) return false
    }
    return true
  })

  // KPI calculations
  const totalOrdersCount = orders.length
  const submittedOrdersCount = orders.filter((o) => o.status === 'SUBMITTED').length
  const simulationOrdersCount = orders.filter((o) => o.isSimulation).length
  const commercialOrdersCount = orders.filter((o) => !o.isSimulation).length

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
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-[10px] font-semibold">
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
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>SUBMITTED</span>
          </Badge>
        )
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 font-sans">
      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Queue Total</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{totalOrdersCount}</p>
          <span className="text-[11px] text-muted-foreground">All logged orders</span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Awaiting Review</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
            {submittedOrdersCount}
          </p>
          <span className="text-[11px] text-muted-foreground">Requires operations action</span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Commercial</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{commercialOrdersCount}</p>
          <span className="text-[11px] text-muted-foreground">Eligible for Tally export</span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Simulation</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-muted-foreground">{simulationOrdersCount}</p>
          <span className="text-[11px] text-muted-foreground">Demo sandboxed orders</span>
        </div>
      </div>

      {/* Policy Notice if disabled */}
      {!reviewPolicyEnabled && (
        <div
          className="rounded-2xl border border-amber-300/80 bg-amber-500/10 p-4 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200 flex items-start gap-3 shadow-2xs"
        >
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Notice: </span>
            Order approvals and stock releases are currently disabled pending distributor operations policy approval. Orders can be inspected and monitored. Simulation orders are labelled with <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 text-[10px] py-0 px-1 inline-block font-semibold">SIMULATED</Badge> and do not modify actual inventory or appear in commercial Tally exports.
          </div>
        </div>
      )}

      {/* Action and Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Status:</span>
            {(['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const).map((status) => (
              <Button
                key={status}
                size="sm"
                variant={selectedStatus === status ? 'default' : 'outline'}
                onClick={() => setSelectedStatus(status)}
                className="h-8 text-xs font-semibold rounded-lg shadow-2xs"
              >
                {status}
              </Button>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Kind:</span>
            <Button
              size="sm"
              variant={typeFilter === 'ALL' ? 'default' : 'outline'}
              onClick={() => setTypeFilter('ALL')}
              className="h-8 text-xs font-semibold rounded-lg shadow-2xs"
            >
              All
            </Button>
            <Button
              size="sm"
              variant={typeFilter === 'COMMERCIAL' ? 'default' : 'outline'}
              onClick={() => setTypeFilter('COMMERCIAL')}
              className="h-8 text-xs font-semibold rounded-lg shadow-2xs"
            >
              Commercial
            </Button>
            <Button
              size="sm"
              variant={typeFilter === 'SIMULATION' ? 'default' : 'outline'}
              onClick={() => setTypeFilter('SIMULATION')}
              className="h-8 text-xs font-semibold rounded-lg shadow-2xs"
            >
              Simulation
            </Button>
          </div>
        </div>

        {/* Search & Export Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-48 sm:w-60">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search order or retailer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </div>

          <Button asChild size="sm" className="h-8 gap-1.5 font-semibold shadow-2xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg">
            <a href="/api/export/tally" download>
              <Download className="h-3.5 w-3.5" />
              <span>Export Tally CSV</span>
            </a>
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`flex items-center gap-2 rounded-xl p-3 text-xs shadow-2xs ${feedback.type === 'error'
            ? 'border border-destructive/20 bg-destructive/10 text-destructive'
            : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
            }`}
        >
          {feedback.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span className="font-medium">{feedback.message}</span>
        </div>
      )}

      {/* Main Grid: Orders Queue & Inspection Pane */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Orders Queue (5 columns) */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Queue Snapshot ({filteredOrders.length})
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {filteredOrders.length} matching
            </span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-xs text-muted-foreground shadow-2xs">
              <Layers className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="font-semibold text-foreground">No orders matching criteria</p>
              <p className="mt-0.5">Try selecting a different status or clear search filters.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[750px] overflow-y-auto pr-1">
              {filteredOrders.map((order) => {
                const isSelected = activeOrder?.id === order.id
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setActiveOrder(order)}
                    data-testid={`order-queue-item-${order.id}`}
                    className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-all ${isSelected
                      ? 'border-primary/80 bg-primary/[0.04] shadow-xs ring-1 ring-primary/20'
                      : 'border-border bg-card hover:border-border/80 hover:bg-muted/30 shadow-2xs'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border">
                          #{order.id.slice(0, 8)}
                        </span>
                        {order.isSimulation && (
                          <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] py-0 px-1 font-semibold">
                            SIMULATED
                          </Badge>
                        )}
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <div className="flex items-baseline justify-between mt-0.5">
                      <span className="text-xs font-medium text-foreground truncate max-w-[180px]">
                        {order.retailerEmail ?? 'Retailer'}
                      </span>
                      <span className="text-sm font-extrabold text-foreground tabular-nums">
                        {formatPaise(order.totalPaise)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-2 mt-1">
                      <span>{order.lines.length} line item{order.lines.length === 1 ? '' : 's'}</span>
                      <span>{formatOrderTime(order.submittedAt)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Column: Order Detail & Actions (7 columns) */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          {activeOrder ? (
            <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-xs">
              {/* Order Detail Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-bold tracking-tight text-foreground font-mono">
                      Order #{activeOrder.id}
                    </h3>
                    {activeOrder.isSimulation && (
                      <Badge variant="outline" className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-xs py-0.5">
                        <Sparkles className="h-3 w-3 mr-1 inline" />
                        SIMULATED ORDER
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Placed by <strong className="text-foreground">{activeOrder.retailerEmail}</strong> on {formatOrderDateTime(activeOrder.submittedAt)}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(activeOrder.status)}
                    {activeOrder.status === 'SUBMITTED' && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={isPending || !reviewPolicyEnabled}
                          onClick={() => handleReview(activeOrder.id, 'APPROVED')}
                          className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs font-semibold gap-1 text-white shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                          title={!reviewPolicyEnabled ? 'Approvals disabled pending distributor policy sign-off' : undefined}
                          data-testid="order-approve-btn"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Approve</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isPending || !reviewPolicyEnabled}
                          onClick={() => handleReview(activeOrder.id, 'REJECTED')}
                          className="h-8 text-xs font-semibold gap-1 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                          title={!reviewPolicyEnabled ? 'Rejections disabled pending distributor policy sign-off' : undefined}
                          data-testid="order-reject-btn"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          <span>Reject</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  {!reviewPolicyEnabled && activeOrder.status === 'SUBMITTED' && (
                    <span className="text-[10px] text-muted-foreground font-medium italic">
                      Actions locked (policy pending)
                    </span>
                  )}
                </div>
              </div>

              {/* Order Meta details Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Gross Total</span>
                  <p className="mt-1 font-bold text-sm text-foreground tabular-nums">{formatPaise(activeOrder.subtotalPaise)}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Discount</span>
                  <p className="mt-1 font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                    -{formatPaise(activeOrder.discountPaise)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Net Amount</span>
                  <p className="mt-1 font-extrabold text-sm text-foreground tabular-nums">{formatPaise(activeOrder.totalPaise)}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Price Basis</span>
                  <p className="mt-1 font-semibold text-xs text-foreground uppercase">
                    {activeOrder.priceBasisConfirmed ? 'CONFIRMED' : 'PROVISIONAL'}
                  </p>
                </div>
              </div>

              {/* Line items table */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Order Line Items ({activeOrder.lines.length})
                </h4>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-muted/50 text-muted-foreground font-semibold">
                      <tr>
                        <th className="p-3">Item / SKU</th>
                        <th className="p-3">Paid Qty</th>
                        <th className="p-3">Free Qty</th>
                        <th className="p-3">Unit Price</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {activeOrder.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3">
                            <p className="font-semibold text-foreground">{line.productName}</p>
                            <span className="font-mono text-[11px] text-muted-foreground">{line.sku}</span>
                          </td>
                          <td className="p-3 font-medium">
                            {line.paidQty} {line.sellingUnit.toLowerCase()}
                          </td>
                          <td className="p-3">
                            {line.freeQty > 0 ? (
                              <span className="font-bold text-primary">+{line.freeQty} free</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="p-3 tabular-nums">{formatPaise(line.unitPricePaise)}</td>
                          <td className="p-3 text-right font-bold text-foreground tabular-nums">{formatPaise(line.totalPaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rejection notice if rejected */}
              {activeOrder.rejectionReason && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
                  <span className="font-bold">Rejection Reason: </span>
                  {activeOrder.rejectionReason}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-card shadow-2xs">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="font-semibold text-foreground text-sm">No order selected</p>
              <p className="mt-0.5">Select an order from the queue to view line item snapshots and trade schemes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
