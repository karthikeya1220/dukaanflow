'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendMagicLink } from '@/app/actions/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ArrowRight, Mail } from 'lucide-react'

const initialState: { ok: boolean; error?: string } = { ok: false }

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} className="w-full">
      {pending ? 'Sending verification link…' : (
        <>
          Sign in
          <ArrowRight />
        </>
      )}
    </Button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useActionState(sendMagicLink, initialState)

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-[350px]">
        <div className="flex flex-col items-center gap-1 pb-6 text-center">
          <span
            aria-hidden="true"
            className="mb-2 flex h-8 w-8 items-center justify-center rounded-[7px] bg-primary text-base font-bold leading-none text-primary-foreground"
          >
            D
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">DukaanFlow</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your registered business email
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-5">
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@yourshop.in"
                required
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? 'login-feedback' : undefined}
              />
            </div>

            <SubmitButton />

            {state.ok ? (
              <div
                id="login-feedback"
                role="status"
                aria-live="polite"
                className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm"
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-medium">Check your inbox</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    We sent a one-time sign-in link. Open it on this device to continue.
                  </p>
                </div>
              </div>
            ) : state.error ? (
              <div
                id="login-feedback"
                role="alert"
                aria-live="assertive"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {state.error}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </main>
  )
}
