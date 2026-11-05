import { Skeleton } from '@/components/ui/skeleton'
import { cn } from 'cn'

/**
 * Loading placeholders.
 *
 * Every skeleton mirrors the real layout it replaces — same column count,
 * same row heights, same number of text lines — so nothing jumps when the
 * data lands. Static (no pulse) is not used; the pulse is subtle and is
 * suppressed by the global reduced-motion rule.
 */

export function CatalogueSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="catalogue-skeleton"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-5 w-full" />
          <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CartSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4" data-testid="cart-skeleton">
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export function OrderListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4" data-testid="order-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function OrderDeskSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-6 lg:grid-cols-12"
      data-testid="order-desk-skeleton"
    >
      <div className="flex flex-col gap-2 lg:col-span-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="mt-3 h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="lg:col-span-7">
        <div className="rounded-lg border border-border bg-card p-6">
          <Skeleton className="h-6 w-64" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="mt-6 h-40 w-full" />
        </div>
      </div>
    </div>
  )
}

/** Inline, announced progress for an in-flight server action. */
export function InlineProgress({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}
    >
      <span
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
      />
      {label}
    </p>
  )
}
