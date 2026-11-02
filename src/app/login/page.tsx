'use client';

import {
  useActionState,
} from "react";
import { useFormStatus } from "react-dom";
import { sendMagicLink } from "@/app/actions/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const initialState: { ok: boolean; error?: string } = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Sending..." : "Sign in"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(sendMagicLink, initialState);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? "login-feedback" : undefined}
              />
            </div>
            <SubmitButton />
            {state.ok ? (
              <p id="login-feedback" role="status" aria-live="polite">
                Check your inbox
              </p>
            ) : state.error ? (
              <p
                id="login-feedback"
                role="alert"
                aria-live="assertive"
              >
                {state.error}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
