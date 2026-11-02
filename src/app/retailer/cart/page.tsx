import Link from 'next/link'
import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/actions/auth'
import { CartClient } from './cart-client'
import { getCartForRetailer } from '@/lib/cart-service'

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
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
      <header className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">RETAILER</Badge>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm" data-testid="logout-button">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <nav className="mx-auto flex w-full max-w-4xl gap-2" aria-label="Retailer navigation">
        <Button asChild variant="outline" size="sm">
          <Link href="/retailer">Back to catalogue</Link>
        </Button>
      </nav>
      <CartClient initialCart={cart} />
    </main>
  )
}
