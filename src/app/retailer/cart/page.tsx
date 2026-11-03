import Link from 'next/link'
import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/actions/auth'
import { CartClient } from './cart-client'
import { getCartForRetailer } from '@/lib/cart-service'
import { Store, LogOut, ArrowLeft } from 'lucide-react'

export const instant = false

export default async function RetailerCartPage() {
  const { user } = await requireRole('RETAILER')
  const currentUser = await getCurrentUserWithRole()
  const retailer = currentUser
    ? await prisma.user.findUnique({
        where: { authSubject: currentUser.user.id },
        select: { id: true },
      })
    : null
  const cart = retailer ? (await getCartForRetailer(retailer.id)).view : null

  return (
    <div className="min-h-screen bg-muted/20 pb-16 font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-lg">DukaanFlow</span>
                <Badge variant="outline" className="border-primary/30 text-primary text-[10px] px-1.5 py-0 font-medium">
                  RETAILER
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 shadow-xs">
              <Link href="/retailer">
                <ArrowLeft className="h-4 w-4" />
                <span>Catalogue</span>
              </Link>
            </Button>

            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-muted-foreground hover:text-foreground"
                data-testid="logout-button"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-1.5">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Your cart</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review staged line items, trade schemes, and submit order.
            </p>
          </div>
          <Badge variant="secondary" className="self-start sm:self-auto font-mono text-xs">
            RETAILER PORTAL
          </Badge>
        </div>

        <nav className="flex items-center gap-2" aria-label="Retailer navigation">
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
            <Link href="/retailer">← Back to catalogue</Link>
          </Button>
        </nav>

        <CartClient initialCart={cart} />
      </main>
    </div>
  )
}
