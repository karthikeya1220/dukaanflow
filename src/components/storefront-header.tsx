import Link from 'next/link'
import { signOut } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/brand'
import { CartCountBadge } from '@/components/cart-count-badge'
import { cn } from 'cn'
import { ShoppingBag, ShoppingCart, Clock, LogOut } from 'lucide-react'

/**
 * Premium Storefront Header shared by retailer pages.
 * Designed with subtle border, backdrop blur, crisp typography,
 * responsive mobile navigation, and explicit accessible testids.
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
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150',
      isActive
        ? 'bg-muted text-foreground font-semibold shadow-2xs'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
    )

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Left: Brand + Role Badge */}
        <div className="flex items-center gap-3">
          <Brand />
          <span className="hidden h-4 w-px bg-border sm:inline-block" aria-hidden="true" />
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
              Retailer
            </span>
            {email && (
              <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={email}>
                {email}
              </span>
            )}
          </div>
        </div>

        {/* Center/Right: Navigation Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <nav className="flex items-center gap-1" aria-label="Retailer navigation">
            <Link
              href="/retailer"
              className={linkClass(active === 'catalogue')}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Catalogue</span>
            </Link>
            <Link
              href="/retailer/orders"
              className={linkClass(active === 'orders')}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Orders</span>
            </Link>
            <Link
              href="/retailer/cart"
              className={linkClass(active === 'cart')}
              data-testid="cart-link"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Cart</span>{' '}
              <CartCountBadge initial={cartCount} />
            </Link>
          </nav>

          <span className="h-4 w-px bg-border/80 mx-1" aria-hidden="true" />

          {/* Sign Out */}
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              data-testid="logout-button"
              title="Sign out of Retailer Portal"
            >
              <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
