# AGENTS.md

## Objective

Build a production-quality FMCG distributor ordering application for the Isocode Software Engineering assessment.

## Product scope

- Retailer catalogue with prices, stock and schemes.
- Cart and order placement.
- AI-powered text order capture.
- Human review and confirmation.
- Order desk with approval and Tally CSV export.

## Roles

- `RETAILER`
- `ORDER_DESK`

## Technology

Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Supabase PostgreSQL, Prisma, Zod, Vitest, Playwright.

## Engineering rules

1. Inspect existing code before modifying it.
2. Prefer small, focused, maintainable modules.
3. Do not introduce unnecessary dependencies.
4. Validate all external inputs with Zod.
5. Enforce authorization on the server.
6. Never trust client-supplied prices, discounts or stock.
7. Use database transactions for critical order operations.
8. Keep financial calculations deterministic.
9. Use integer paise for monetary calculations.
10. Keep AI extraction separate from order creation.
11. Never allow AI to approve or submit an order.
12. Add tests for every important business rule.
13. Do not silently invent client business rules.
14. Document every assumption in the TDD.
15. Never commit secrets or real customer data.

## AI rules

- AI proposes product mappings only.
- Validate every suggested SKU against the database.
- Preserve original retailer text.
- Show alternatives for uncertain matches.
- Ask for clarification when units are ambiguous.
- Calculate confidence using matching evidence.
- Require explicit human confirmation.

## Quality gates

Before completing a task:

- Run relevant tests.
- Run TypeScript type checking.
- Run linting.
- Inspect the git diff.
- Report any incomplete work honestly.

## Workflow

- Work in small milestones.
- Do not implement optional features before core flows.
- Do not overwrite unrelated user changes.
- Preserve Git history.
- Commit only after verification.

## Repo status

Scaffolded (M0) and verified. Working commands (run from repo root):

- `npm run lint` / `npm run typecheck` / `npm test` — quality gates (all green at M0).
- `npx supabase start` · `npx supabase status` · `npx supabase stop` — local stack (API :54321, Postgres :54322, Mailpit mail UI/API :54324). Requires Docker.
- `npx prisma migrate dev` · `npx prisma generate` — schema + client. CLI config is **`prisma7.config.ts`** (auto-discovered; loads `.env` via `dotenv/config`).
- `npm run db:seed` — idempotent demo-user provisioning (Admin API first, then `public.users` upsert). `npx tsx scripts/db-check.ts` — DB connectivity check.
- `npm run dev` → `http://localhost:3000/login`.

Gotchas: generated client lives at `src/generated/prisma` (gitignored — run `npx prisma generate` after install); `.env` holds local-only credentials (`.env.example` is the committed template); assumptions live in `docs/TDD.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
