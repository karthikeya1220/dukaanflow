'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendMagicLink } from '@/app/actions/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle2, ShieldAlert, Building2, Store } from 'lucide-react'
import Link from 'next/link'

const initialState: { ok: boolean; error?: string } = { ok: false }

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="w-full font-semibold shadow-2xs h-10 gap-2 rounded-xl"
    >
      {pending ? (
        'Sending magic link…'
      ) : (
        <>
          <span>Sign In with Email</span>
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </Button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useActionState(sendMagicLink, initialState)

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center bg-muted/20 p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md">
        {/* Brand identity */}
        <div className="flex flex-col items-center gap-1.5 pb-6 text-center">
          <Link href="/" className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-xl font-bold leading-none text-primary-foreground shadow-xs">
            D
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Sign in to DukaanFlow
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-xs">
            FMCG distributor ordering platform. Passwordless, secure magic link access.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-xs">
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Business Email Address
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="retailer@dukaanflow.test"
                required
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? 'login-feedback' : undefined}
                className="h-10 rounded-xl bg-background text-sm"
              />
            </div>

            <SubmitButton />

            {state.ok ? (
              <div
                id="login-feedback"
                role="status"
                aria-live="polite"
                className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-900 dark:text-emerald-200 shadow-2xs"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <div>
                  <p className="font-bold text-sm">Check your inbox</p>
                  <p className="mt-1 leading-relaxed">
                    We sent a secure magic link to your email. Click the link to complete authentication.
                  </p>
                </div>
              </div>
            ) : state.error ? (
              <div
                id="login-feedback"
                role="alert"
                aria-live="assertive"
                className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{state.error}</span>
              </div>
            ) : null}
          </form>

          {/* Quick Demo Accounts Helper */}
          <div className="mt-6 border-t border-border/70 pt-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-2.5">
              Available Demo Credentials:
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <Store className="h-3.5 w-3.5 text-primary" />
                  <span>Retailer</span>
                </div>
                <code className="text-[11px] text-muted-foreground block mt-1 truncate">
                  retailer@dukaanflow.test
                </code>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span>Order Desk</span>
                </div>
                <code className="text-[11px] text-muted-foreground block mt-1 truncate">
                  desk@dukaanflow.test
                </code>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protected by server-side Role-Based Access Control and session verification.
        </p>
      </div>
    </main>
  )
}
