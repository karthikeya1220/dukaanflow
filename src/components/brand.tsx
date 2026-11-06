import Link from 'next/link'
import { cn } from 'cn'

/** Minimal brand wordmark — small solid mark + text, no gradients or glow. */
export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('group flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-primary text-[13px] font-bold leading-none text-primary-foreground"
      >
        D
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">
        DukaanFlow
      </span>
    </Link>
  )
}
