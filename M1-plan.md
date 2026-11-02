# M1 — Authentication & RBAC

## Objective

Implement email magic-link login for DukaanFlow with server-side session handling, role-based route protection, and a supporting test surface.

## Scope

- Supabase magic-link login using PKCE.
- Server-side callback and secure cookie persistence.
- Logout.
- Database-backed role resolution through `public.users`.
- `requireRole("RETAILER" | "ORDER_DESK")`.
- Protected retailer and order-desk routes.
- Next.js 16 `src/proxy.ts`.
- Unit and browser E2E tests.

## Roles

- `RETAILER`
- `ORDER_DESK`

## Technology

- Next.js 16.4.3 (App Router, `proxy.ts` replaces the old `middleware.ts` name)
- TypeScript
- Tailwind CSS + shadcn/ui
- Supabase JS 2.118.0
- @supabase/ssr 0.12.7
- Prisma 7.10.1 + @prisma/adapter-pg
- Zod 4.6.7
- Vitest 5.0.5 + Playwright (`@playwright/test`)

---

## Verified implementation notes

These notes were checked against the installed package versions and the existing code in the working tree before implementation continues.

### 1. Supabase `signInWithOtp` — `shouldCreateUser` belongs inside `options`

Verified in the installed `@supabase/supabase-js` implementation: for the email path, `signInWithOtp` destructures `{ email, options }` from the call arguments and reads `shouldCreateUser` and `emailRedirectTo` from `options`, not from the top-level call object.

Correct call shape:
```ts
supabase.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: false,
    emailRedirectTo: `${SITE_URL}/auth/callback`,
  },
})
```

This is already how `src/app/actions/auth.ts` is implemented.

### 2. Session refresh in `src/proxy.ts` — use the supported `@supabase/ssr` pattern

The supported pattern for cookie-based SSR with `@supabase/ssr` is:

- Create a `createServerClient` with `getAll`/`setAll` cookie methods.
- Call `supabase.auth.getUser()` (or `getClaims()`) so the client initializes/refresh the session as needed.
- Let `setAll` write refreshed cookies into the outgoing response before that response is returned.

The installed `@supabase/ssr` README and `src/createServerClient.ts` both describe this as the recommended pattern, and they explicitly warn that failing to propagate refreshed cookies back to the response through `setAll` causes random logouts and session loss.

For Next.js specifically, the same docs note that the proxy/middleware file is where session refresh is normally done once per request and where updated cookies are written back onto the response. `src/proxy.ts` is therefore the correct place for refresh; it is **not** the authorization boundary. Authorization still happens downstream with `requireRole` in Server Components and Server Actions.

The existing `src/proxy.ts` already uses `createServerClient` + `getUser()` + a `redirectWithCookies` helper that copies refreshed cookies from the Supabase response into redirect responses. That approach is consistent with the supported pattern.

### 3. Callback URL — construct from a trusted `SITE_URL`, not from `Host`/`Origin`

The magic-link redirect target must be built from a trusted server-side environment value.

Current implementation already does this:

- `src/app/actions/auth.ts` builds `emailRedirectTo` from `process.env.SITE_URL`.
- `src/app/auth/callback/route.ts` derives its redirect URLs from the request object (`request.url`/`origin`) only after the code exchange has already happened.

Do not trust arbitrary client-supplied `Host` or `Origin` headers when constructing the redirect target for the magic link itself.

### 4. Playwright E2E — real browser login flow

E2E tests must exercise the actual user-visible login path:

- Initiate login by submitting the real login form in the browser.
- The PKCE verifier lives in the browser context that submitted the form.
- Retrieve the actual magic-link email from Mailpit, not a hardcoded URL.
- Follow the real magic link in the same browser context.
- Test cross-device failure by removing the Supabase verifier cookie from that browser context before following the link, then asserting the cross-device error page.

The existing `tests/e2e/auth.spec.ts` already follows this pattern:
- `submitLoginForm` fills and submits the form through the page.
- `getMagicLink` polls the Mailpit API for the real email.
- `loginAs` follows the retrieved link in the same `page`.
- The cross-device test clears `sb-*` cookies from the browser context before visiting the link.

---

## Current implementation state

As of this plan update, the M1 implementation files already exist in the working tree and already reflect the four corrections above. This plan exists to keep the design, test intent, and acceptance criteria aligned with verified package behavior before implementation work continues and before any commit is made.

### Existing files in scope

- `src/app/actions/auth.ts`
- `src/app/auth/callback/route.ts`
- `src/app/auth/error/page.tsx`
- `src/app/login/page.tsx`
- `src/app/retailer/page.tsx`
- `src/app/order-desk/page.tsx`
- `src/lib/auth/require-role.ts`
- `src/lib/auth/session.ts`
- `src/lib/supabase/browser.ts`
- `src/lib/supabase/server.ts`
- `src/proxy.ts`
- `playwright.config.ts`
- `tests/e2e/auth.spec.ts`
- `tests/unit/auth-session.test.ts`
- `tests/unit/require-role.test.ts`
- `vitest.config.ts`

### Existing supporting config changes already in the working tree

- `.env.example` adds `SITE_URL`.
- `next.config.ts` enables `experimental.authInterrupts`.
- `playwright.config.ts` is wired for the E2E suite with the local dev server.
- `supabase/config.toml` already has the `/auth/callback` redirect URL. Preserve it.

---

## Acceptance criteria

### Authentication

- A retailer can request a magic link from `/login` and sign in by following the real link from their email.
- An order-desk user can do the same and land on `/order-desk`.
- Signing in again while already authenticated redirects away from `/login`.
- Signing out clears the session and returns to `/login`.
- A fresh visit to a protected route after signout redirects to `/login`.

### Authorization

- `/retailer` is only accessible to `RETAILER`.
- `/order-desk` is only accessible to `ORDER_DESK`.
- A retailer cannot access `/order-desk`, and an order-desk user cannot access `/retailer`.
- Role is resolved from the database, not from any client-supplied value.

### Error handling

- A magic link without a code redirects to the error page with `reason=no_code`.
- A cross-device or otherwise invalid PKCE exchange redirects to the error page with `reason=cross_device`.
- An unregistered email does not enumerate users; the public-facing message is generic.
- Server errors during session resolution do not leak service-role credentials or internal details.

### Tests

- Unit tests cover role resolution and the `requireRole`/`checkRole` behavior.
- E2E tests cover the real browser login flow for both roles, cross-device PKCE failure, role-gating, and logout.

---

## Constraints

- Preserve M0.
- No architecture redesign.
- No unnecessary dependencies.
- No M2 features.
- Never trust client-supplied roles.
- Never expose service-role credentials.
- Do not claim tests passed unless executed.
- Inspect the complete diff before committing.

## Workflow

- Work in small milestones.
- Verify the four corrections against installed package versions and existing code before changing anything. **Done in this plan update.**
- Update this plan first. **Done.**
- Implement M1 phase by phase, with tests and review gates.
- Stop after M1.

## Quality gates

Before completing a task:

- Run relevant tests.
- Run TypeScript type checking.
- Run linting.
- Inspect the git diff.
- Report any incomplete work honestly.
