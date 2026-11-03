'use client';

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendMagicLink } from "@/app/actions/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Store, ArrowRight, ShieldCheck, Mail, Sparkles } from "lucide-react";

const initialState: { ok: boolean; error?: string } = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="w-full font-medium h-10 shadow-xs transition-all flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          <span>Sending verification link...</span>
        </>
      ) : (
        <>
          <span>Sign in</span>
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(sendMagicLink, initialState);

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md ring-4 ring-primary/10 mb-3">
            <Store className="h-6 w-6" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-foreground">DukaanFlow</span>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">B2B</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            FMCG Distributor-Retailer Commerce Platform
          </p>
        </div>

        <Card className="w-full border-border/80 shadow-sm bg-card">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold tracking-tight">Login to DukaanFlow</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Enter your registered business email. We&apos;ll email you a secure login link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-xs font-medium text-foreground">
                  Registered Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="retailer@dukaanflow.test"
                    required
                    aria-invalid={state.error ? true : undefined}
                    aria-describedby={state.error ? "login-feedback" : undefined}
                    className="pl-9 h-10 text-sm focus-visible:ring-primary/20"
                  />
                </div>
              </div>

              <SubmitButton />

              {state.ok ? (
                <div
                  id="login-feedback"
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary flex items-start gap-2.5"
                >
                  <Mail className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-xs">Check your inbox</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      We sent a one-time sign in link. Click it to enter your workspace.
                    </p>
                  </div>
                </div>
              ) : state.error ? (
                <div
                  id="login-feedback"
                  role="alert"
                  aria-live="assertive"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  {state.error}
                </div>
              ) : null}
            </form>

            <div className="mt-6 border-t border-border/60 pt-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Pre-configured test accounts
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border/60 bg-muted/40 p-2.5">
                  <span className="font-medium text-foreground block">Retailer Portal</span>
                  <code className="text-[10px] text-muted-foreground font-mono block truncate">retailer@dukaanflow.test</code>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/40 p-2.5">
                  <span className="font-medium text-foreground block">Order Desk</span>
                  <code className="text-[10px] text-muted-foreground font-mono block truncate">desk@dukaanflow.test</code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Passwordless PKCE Auth
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Order Capture
          </span>
        </div>
      </div>
    </main>
  );
}
