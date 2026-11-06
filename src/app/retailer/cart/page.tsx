import Link from 'next/link'
import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { StorefrontHeader } from '@/components/storefront-header'
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
    <div className="min-h-screen bg-background">
      <StorefrontHeader email={user.email} active="cart" />

      <main className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-6">
        <Link
          href="/retailer"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to catalogue
        </Link>

        <CartClient initialCart={cart} />
      </main>
    </div>
  )
}
