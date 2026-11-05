import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from 'cn'
import { Button, buttonVariants } from '@/components/ui/button'
import { Inbox, RotateCcw, SearchX } from 'lucide-react'

type Tone = 'neutral' | 'error'

/**
 * The one empty/error surface.
 *
 * Every dead end in the product — no products, no search results, empty cart,
 * no orders, failed request — renders through this so the copy, spacing and
 * recovery action are consistent. The action is always a real next step:
 * a link out of the dead end, or a retry.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
  ...props
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  tone?: Tone
  className?: string
  // `title` is redefined above with a wider type than the HTML attribute of
  // the same name, so the base element props drop it.
} & Omit<React.ComponentProps<'div'>, 'title'>) {
  return (
    <div
      {...props}
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center',
        tone === 'neutral'
          ? 'border-border bg-card'
          : 'border-destructive/40 bg-destructive/[0.03]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mb-3 flex size-10 items-center justify-center rounded-full',
          tone === 'neutral' ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive',
        )}
      >
        {icon ?? <Inbox className="size-5" />}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

/** EmptyState with the standard "browse the catalogue" recovery link. */
export function EmptyCatalogue({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      icon={<SearchX className="size-5" />}
      title={title}
      description={description}
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/retailer">Browse the full catalogue</Link>
        </Button>
      }
    />
  )
}

/** Retry affordance for a failed server render or action. */
export function ErrorState({
  title = 'Something went wrong',
  description,
  retryHref,
  className,
}: {
  title?: string
  description: string
  retryHref?: string
  className?: string
}) {
  return (
    <EmptyState
      tone="error"
      icon={<RotateCcw className="size-5" />}
      title={title}
      description={description}
      className={className}
      action={
        retryHref ? (
          <Link
            href={retryHref}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Try again
          </Link>
        ) : undefined
      }
    />
  )
}

export { Inbox }
