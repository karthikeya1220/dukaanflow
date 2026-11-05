import type { ReactNode } from 'react'
import { cn } from 'cn'
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'

type Tone = 'info' | 'success' | 'warning' | 'error'

const TONES: Record<Tone, { wrapper: string; icon: string; Icon: typeof Info }> = {
  info: {
    wrapper: 'border-border bg-muted/60 text-foreground',
    icon: 'text-muted-foreground',
    Icon: Info,
  },
  success: {
    wrapper: 'border-success/30 bg-success/[0.07] text-foreground',
    icon: 'text-success',
    Icon: CheckCircle2,
  },
  warning: {
    wrapper: 'border-warning/45 bg-warning-muted text-warning-foreground',
    icon: 'text-warning-foreground',
    Icon: TriangleAlert,
  },
  error: {
    wrapper: 'border-destructive/35 bg-destructive/[0.06] text-destructive',
    icon: 'text-destructive',
    Icon: AlertCircle,
  },
}

/**
 * The single inline message surface.
 *
 * Used for every piece of feedback that belongs in the flow rather than on its
 * own screen: a successful add-to-cart, a failed request, an unconfirmed price
 * basis, a policy lock. Same icon placement, same padding, same tone set, so
 * the meaning of a colour never changes between routes.
 *
 * `role` defaults follow the semantics of the message: `status` for progress
 * and success (polite), `alert` for errors (assertive).
 */
export function InlineAlert({
  tone = 'info',
  title,
  children,
  action,
  role,
  className,
  ...props
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  role?: 'status' | 'alert' | 'note'
  className?: string
  // `title` and `role` are redefined above with narrower meanings than the
  // HTML attributes of the same name, so the base element props drop them.
} & Omit<React.ComponentProps<'div'>, 'title' | 'role'>) {
  const { wrapper, icon, Icon } = TONES[tone]
  return (
    <div
      {...props}
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed',
        wrapper,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-1')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
