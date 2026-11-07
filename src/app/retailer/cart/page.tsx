import Link from 'next/link'
import { requireRole } from '@/lib/auth/require-role'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { prisma } from '@/db'
import { StorefrontHeader } from '@/components/storefront-header'
import { CartClient } from './cart-client'
import { getCartForRetailer } from '@/lib/cart-service'
import { ArrowLeft } from 'lucide-react'

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
  const cartItemCount = cart?.lines.length ?? 0

  return (
    <div className="min-h-screen bg-muted/15 font-sans">
      <StorefrontHeader email={user.email} cartCount={cartItemCount} active="cart" />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8 lg:px-6 flex flex-col gap-4">
        <Link
          href="/retailer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to catalogue</span>
        </Link>

        <CartClient initialCart={cart} />
      </main>
    </div>
  )
}
