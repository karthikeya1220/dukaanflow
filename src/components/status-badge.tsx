import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock3, XCircle, FlaskConical, Lock } from 'lucide-react'

/**
 * One vocabulary for order state across the retailer views and the order desk.
 *
 * Three axes are kept deliberately separate and never merged:
 *   - review status  (submitted / approved / rejected)
 *   - order kind     (simulation vs commercial)
 *   - price basis    (confirmed vs provisional)
 * Each has its own colour so a scanning eye never has to decode a legend.
 */

const REVIEW_TONES: Record<string, string> = {
  APPROVED: 'border-transparent bg-success text-success-foreground',
  REJECTED: 'border-transparent bg-destructive text-destructive-foreground',
  SUBMITTED: 'border-border bg-muted text-muted-foreground',
}

const REVIEW_ICONS: Record<string, typeof Clock3> = {
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  SUBMITTED: Clock3,
}

const REVIEW_LABELS: Record<string, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUBMITTED: 'In review',
}

export function ReviewBadge({ status, className }: { status: string; className?: string }) {
  const Icon = REVIEW_ICONS[status] ?? Clock3
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 font-medium', REVIEW_TONES[status] ?? REVIEW_TONES.SUBMITTED, className)}
    >
      <Icon className="size-3" aria-hidden="true" />
      {REVIEW_LABELS[status] ?? status}
    </Badge>
  )
}

/** Simulation orders are demo data. Amber, and always worded the same way. */
export function SimulationBadge({ className, long = false }: { className?: string; long?: boolean }) {
  return (
    <Badge
      variant="outline"
      data-testid="simulation-badge"
      className={cn(
        'gap-1 border-warning/50 bg-warning-muted font-medium text-warning-foreground',
        className,
      )}
    >
      <FlaskConical className="size-3" aria-hidden="true" />
      {long ? 'Simulation order' : 'Simulated'}
    </Badge>
  )
}

export function PriceBasisBadge({ confirmed, className }: { confirmed: boolean; className?: string }) {
  if (confirmed) {
    return (
      <Badge variant="outline" className={cn('font-medium', className)}>
        Price confirmed
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 border-warning/50 bg-warning-muted font-medium text-warning-foreground',
        className,
      )}
    >
      Provisional price
    </Badge>
  )
}

/** Stock is indicative and never a reservation — say so in the same words. */
export function StockBadge({
  qty,
  unit,
  className,
}: {
  qty: number
  unit: string
  className?: string
}) {
  if (qty <= 0) {
    return (
      <Badge variant="outline" className={cn('font-medium text-destructive', className)}>
        Out of stock
      </Badge>
    )
  }
  return (
    <span className={cn('inline-flex items-baseline gap-1 text-xs', className)}>
      <span className="font-medium tabular-nums text-foreground">{qty}</span>
      <span className="text-muted-foreground">{unit} indicative</span>
    </span>
  )
}

export function LockedBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 border-border bg-muted font-medium text-muted-foreground', className)}
    >
      <Lock className="size-3" aria-hidden="true" />
      Locked by policy
    </Badge>
  )
}
