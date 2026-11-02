import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// This route reads searchParams at the component level, which prevents
// static prerendering. Mark it as non-instant so Next.js renders it on-demand.
export const instant = false

const MESSAGES: Record<string, { title: string; body: string }> = {
  cross_device: {
    title: 'Link opened in a different browser',
    body: 'Sign-in links must be opened in the same browser where you requested them. Please request a new link.',
  },
  no_code: {
    title: 'Invalid or expired link',
    body: 'This sign-in link is invalid or has already been used. Please request a new link.',
  },
  not_registered: {
    title: 'Account not found',
    body: 'No account was found for this email address. Please contact your administrator.',
  },
}
const DEFAULT = {
  title: 'Authentication error',
  body: 'Something went wrong during sign-in. Please try again.',
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const { title, body } = MESSAGES[reason ?? ''] ?? DEFAULT

  return (
    <main className="flex flex-1 items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-semibold tracking-tight text-red-600 dark:text-red-400">
            {title}
          </CardTitle>
          <CardDescription className="text-sm text-zinc-500">{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full h-9">
            <Link href="/login">Back to sign-in</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
