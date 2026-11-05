import Link from 'next/link'
import { signOut } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/brand'
import { CartCountBadge } from '@/components/cart-count-badge'
import { cn } from 'cn'
import { LogOut } from 'lucide-react'

type RetailerNav = 'catalogue' | 'orders' | 'cart'

const RETAILER_LINKS: Array<{ key: RetailerNav; label: string; href: string }> = [
  { key: 'catalogue', label: 'Catalogue', href: '/retailer' },
  { key: 'orders', label: 'Orders', href: '/retailer/orders' },
  { key: 'cart', label: 'Cart', href: '/retailer/cart' },
]

/**
 * The single application header.
 *
 * Both roles render the same object — same brand mark, same structure, same
 * sign-out control — so the product reads as one application rather than two
 * templates sharing a domain. It is one `<nav>` element that reflows: on a
 * phone the links take their own full-width row (44px targets), from 640px
 * they sit inline beside the brand.
 *
 * Server component: sign-out is a server action, so the bar ships as HTML and
 * only the cart count is a client island.
 */
export function AppHeader({
  email,
  active,
  cartCount = 0,
  context,
  nav,
}: {
  email?: string | null
  /** Which retailer link is current; omit for the order desk. */
  active?: RetailerNav
  /** Retailer navigation; omit for the order desk, which has a single view. */
  nav?: RetailerNav
  cartCount?: number
  /** Short role label shown beside the brand on wide screens. */
  context?: string
}) {
  const linkClass = (isActive: boolean) =>
    cn(
      'relative inline-flex items-center text-sm transition-colors',
      // Touch target on the phone row, tighter on the inline desktop row.
      'h-11 flex-1 justify-center sm:h-auto sm:flex-none sm:px-1',
      isActive
        ? 'font-medium text-foreground'
        : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 px-4 sm:h-14 sm:flex-nowrap lg:px-6">
        <Brand />

        {context ? (
          <>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="hidden truncate text-xs text-muted-foreground sm:block">
              {context}
            </span>
          </>
        ) : null}

        {nav ? (
          <nav
            aria-label="Retailer navigation"
            className="order-last flex w-full items-stretch gap-4 border-t border-border/60 pt-0 sm:order-none sm:ml-auto sm:w-auto sm:border-t-0"
          >
            {RETAILER_LINKS.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                data-testid={link.key === 'cart' ? 'cart-link' : undefined}
                aria-current={active === link.key ? 'page' : undefined}
                className={linkClass(active === link.key)}
              >
                <span className="flex items-center gap-1.5">
                  {link.label}
                  {link.key === 'cart' ? (
                    <>
                      {' '}
                      <CartCountBadge initial={cartCount} />
                    </>
                  ) : null}
                </span>
                {active === link.key ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary sm:inset-x-0"
                  />
                ) : null}
              </Link>
            ))}
          </nav>
        ) : (
          <span className="hidden flex-1 sm:block" />
        )}

        <div className={cn('ml-auto flex items-center gap-2', nav && 'sm:ml-0')}>
          {email ? (
            <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground md:block">
              {email}
            </span>
          ) : null}
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              data-testid="logout-button"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
              <span className="sr-only sm:hidden">Sign out</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
