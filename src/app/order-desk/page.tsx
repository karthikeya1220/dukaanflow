import { requireRole } from '@/lib/auth/require-role'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/actions/auth'
import { Badge } from '@/components/ui/badge'

export default async function OrderDeskPage() {
  const { user } = await requireRole('ORDER_DESK')

  return (
    <main className="flex flex-1 flex-col p-8 max-w-2xl mx-auto gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Desk</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">ORDER DESK</Badge>
          <form action={signOut}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              data-testid="logout-button"
            >
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 text-sm text-zinc-500">
        Order approval and Tally export arrive in M5/M6.
      </div>
    </main>
  )
}
