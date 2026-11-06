import Link from 'next/link'
import { signOut } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/brand'
import { CartCountBadge } from '@/components/cart-count-badge'
import { cn } from 'cn'

/**
 * Storefront top bar shared by retailer pages — hairline header, compact
 * height, text nav signifiers. Server component; sign-out via server action.
 */
export function StorefrontHeader({
  email,
  cartCount = 0,
  active,
}: {
  email?: string | null
  cartCount?: number
  active?: 'catalogue' | 'orders' | 'cart'
}) {
  const linkClass = (isActive?: boolean) =>
    cn(
      'rounded-sm px-2 py-1 text-sm transition-colors',
      isActive
        ? 'bg-muted font-medium text-foreground'
        : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-4 px-4 lg:px-6">
        <Brand />
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">
          Retailer <span className="hidden max-w-[180px] truncate text-foreground sm:inline">· {email}</span>
        </span>

        <nav className="ml-auto flex items-center gap-1" aria-label="Retailer navigation">
          <Link href="/retailer" className={linkClass(active === 'catalogue')}>
            Catalogue
          </Link>
          <Link href="/retailer/orders" className={linkClass(active === 'orders')}>
            Orders
          </Link>
          <Link href="/retailer/cart" className={linkClass(active === 'cart')} data-testid="cart-link">
            Cart
            {' '}
            <CartCountBadge initial={cartCount} />
          </Link>
        </nav>

        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            data-testid="logout-button"
          >
            Sign out
          </Button>
        </form>
      </div>
    </header>
  )
}
