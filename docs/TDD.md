# DukaanFlow — Technical Design Document (Assumptions & Decisions)

Rule 14: every assumption is recorded here. Status: M0.

## Authentication (verified empirically, 2026-11-02, Supabase local stack)

- Client requirement: **email OTP login**. Implementation: Supabase Auth `POST /auth/v1/otp`.
- Local email template (default) sends a **magic link only — no 6-digit code**.
- **Verified working session path:** `GET /auth/v1/verify?token=<link-token>&type=magiclink&redirect_to=…`
  → `303` with `access_token` + `refresh_token` in the redirect fragment (and `Sb-Auth-*` headers).
- **Verified non-working:** `POST /auth/v1/verify` with the link token → `403 otp_expired`
  (that endpoint expects a 6-digit OTP code; without `email` → `400`). A code flow requires a
  `{{ .Token }}` email-template override (not present; not assumed).
- No password fallback was needed — OTP delivery (Mailpit `:54324`) and session creation both verified.
- Demo users are provisioned idempotently by `npm run db:seed` (Admin-API existence check → create
  with `email_confirm: true` only if missing → `public.users` upsert keyed on the Auth uid).

## Inventory

- **No inventory reservation or decrement exists in this implementation.** The quantity check at
  submission (`INSUFFICIENT_STOCK` / stock-status gates at confirm and submit) compares required
  (paid + free) quantity against `inventory_qty`, but no write ever mutates stock. This was
  reviewed and deliberately kept: no approved distributor business policy for reservation,
  decrement, or release exists, and none was invented.
- Consequently all displayed stock is **indicative stock only** — two retailers may overlap on the
  same quantity. UI copy labels it "Indicative stock" and no claim of reservation is made.
- Schema fields that sound transactional (`orders.reservation_expires_at`,
  `order_lines.reserved_qty`, `orders.inventory_released_at`) are asserted **not** to have
  reservation semantics: `reserved_qty` stores the computed required quantity
  (paid + free), `reservation_expires_at` records the configured TTL from the order's submission
  time for reference, and `inventory_released_at` stays `NULL` unless a future policy defines a
  real release. `ORDER_RESERVATION_TTL_HOURS` is documentation-only configuration.
- If a distributor later defines a reservation policy, the single touch points are
  `submitCartToOrder` (decrement) and `updateOrderStatus` (release); TDD must be updated first.

## Financial precision

- All money is integer **paise**. Percentage discounts are computed in basis points and
  **rounded down to the nearest paise** (`Math.floor`) — the distributor absorbs rounding.
- Free quantities have zero payable value; the required quantity at stock check is
  `paid_qty + free_qty`.
- Fractional-paise discount cases are covered by unit tests (M3).

## Price basis (unresolved — preserved)

- The client sample does not state whether dealer prices are **per pack or per case**.
- `products.price_paise` is stored and used **verbatim**; nothing ever multiplies by pack size.
- To be confirmed with the client; single point of change if clarified.

## Order lifecycle

- Whole-order only: `SUBMITTED → APPROVED | REJECTED` (order desk). No partial approval,
  no line edits, no retailer cancel (v1).
- Double-approve is prevented by an atomic status-guarded `UPDATE … WHERE status='SUBMITTED'`.
- AI never creates, approves, or submits orders (it only proposes cart mappings, M7).
- Order submission re-verifies the cart's `confirmed_fingerprint` against live cart contents;
  modified or stale carts are rejected with `CART_CONTENTS_CHANGED`.
- Idempotency: the retailer client holds a stable UUID key for one confirm cycle (stable across
  retries and double-clicks, regenerated on success); the server resolves duplicates inside the
  submission transaction, backed by the `(retailer_id, idempotency_key)` unique index.
- Simulation status is decided **server-side** by which authorized server action runs
  (`submitOrder` → always commercial, `submitSimulationOrder` → always simulation); request fields
  can never flip it.

## AI order capture (M7, real integration)

- Provider: **OpenRouter** (OpenAI-compatible chat completions), server-only module
  `src/lib/ai/openrouter.ts`. Credentials come from `AI_API_KEY`, model from `AI_MODEL`
  (default `openrouter/free` — OpenRouter's auto-router dynamically selects an available
  free-tier model; the app never auto-switches to paid models), timeout `AI_TIMEOUT_MS`
  (default 20s). Keys never leave the server; the actual model id that answered
  (`payload.model`) is captured for sanitized diagnostics — it can differ from the
  requested id when a router auto-selects.
- Free-model compatibility: models auto-selected by `openrouter/free` vary in capability.
  The first request attempts JSON mode (`response_format: json_object`); if the selected
  model rejects structured output (HTTP 400/422/404 + response-format error text), the
  request is retried **once without `response_format`** — the prompt itself demands a bare
  JSON object and Zod still validates it. Unsupported modes never trigger any model
  substitution, paid or otherwise.
- Structured JSON contract, validated with Zod; the model prompt embeds the live catalogue
  (SKU-name-unit list only — no prices, schemes or stock) and is forbidden from inventing SKUs.
- Every proposed SKU is **revalidated against the database** before display; unknown SKUs are
  discarded. Confidence is normalized to 0–100 integers shared by backend and UI.
- Low-confidence (<70) or ambiguous-unit proposals are marked `requiresReview`, are **not
  preselected** in the confirmation UI, and can never be applied without an explicit user
  selection + "Confirm & Add to Cart" click; the apply action re-validates every SKU against
  the database again. The model never computes prices, discounts or totals and has no path to
  submit or approve orders.
- Failure handling: missing credentials, timeout, rate limits (429), provider errors (4xx/5xx)
  and malformed/non-JSON model output each map to a typed `AiProviderError` code; on any failure
  the deterministic rule engine is used and the UI shows an explicit
  "AI service unavailable — rule-based fallback" notice with guidance toward manual catalogue
  ordering. Fallback results are always labelled `engine: 'deterministic-fallback'`.

## Schemes

- Exactly the two specified rules, typed and deterministic:
  `BUY_X_GET_Y {buyQty:10, freeQty:1}` and `THRESHOLD_PERCENT {minQty:5, bps:300}`.
- No general stacking framework. Seed data scopes the two schemes to distinct products; if a line
  ever qualifies for both, fixed order = free-units first, then percentage on the remainder
  (documented default, changeable in one function).

## Tally export

- Deterministic CSV of approved orders (stable column/row order, RFC-4180 escaping,
  paise→rupees at 2 decimals). Fields beginning with `=`, `+`, `-`, `@` or a tab are neutralized
  with an apostrophe prefix to block spreadsheet formula injection. **No production Tally voucher
  format was provided** — none is invented; output is re-mappable when the real format arrives.

## Scope

- Single distributor tenant. Tax/GST, payments, notifications, password reset, scheme admin UI:
  out of scope (v1).

## Production Readiness & Operations (Added M7 Refinement)

### Environment Variables
- `DATABASE_URL`: Pooled connection string to Postgres (Port 6543 on Supabase / PgBouncer).
- `DIRECT_URL`: Direct port 5432 string for DDL migrations.
- `NEXT_PUBLIC_SUPABASE_URL`: Public Supabase API URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anonymous key.
- `SUPABASE_SERVICE_ROLE_KEY`: Elevated administrative key used strictly for seed scripts.
- `SITE_URL`: Application origin (e.g. `https://dukaanflow.vercel.app`).
- `AI_API_KEY`: OpenRouter server API key (optional; defaults to rule engine if empty).
- `AI_MODEL`: Router model name (`openrouter/free`).
- `ENABLE_COMMERCIAL_SUBMISSION`: Feature flag for commercial orders (default: `false`).
- `ENABLE_ORDER_DESK_REVIEW`: Feature flag for Order Desk approvals (default: `false`).

### Policy Gates
- **Commercial Order Gate**: `submitCartToOrder` asserts `isCommercialSubmissionEnabled()`. Throws `COMMERCIAL_SUBMISSION_BLOCKED` when false. Retailers must use simulation submission until inventory and pricing agreements are finalized.
- **Order Review Gate**: `updateOrderStatus` asserts `isOrderReviewPolicyEnabled()`. Throws `REVIEW_POLICY_DISABLED` when false. Order Desk users inspect orders in a read-only queue.
- **Price Basis Restriction**: Orders with `priceBasis === 'UNCONFIRMED'` are strictly forbidden from commercial submission and commercial Tally export.

### AI Clarification & Unit Invalidation Behavior
- When requested unit differs from product selling unit (e.g., PACK vs CASE), the parser marks `unitAmbiguous: true` and `requiresReview: true`.
- The UI excludes ambiguous proposals from default selection.
- Modifying the quantity stepper for an ambiguous item does **not** auto-confirm the proposal.
- Confirmation requires clicking `Accept [Qty] [unit]` or `Confirm [Qty] [unit]`.
- Modifying the quantity after confirmation immediately invalidates the previous confirmation.

### Simulation vs Commercial Order Separation
- Schema stores `orders.is_simulation: Boolean` (indexed).
- Tally CSV export endpoint (`/api/export/tally`) queries with `where: { isSimulation: false, priceBasisConfirmed: true, status: 'APPROVED' }`.
- Simulated orders can never be emitted in commercial accounting exports.

### Migration Runbook & Checklist
1. Replay all 7 migrations with `npx prisma migrate deploy`.
2. Seed initial catalogue and admin accounts with `npm run db:seed`.
3. Verify test safety assertion with `TEST_DB_MUTATIONS=1 TEST_DATABASE_NAME=postgres TEST_DATABASE_SCHEMA=public npm test`.
4. Run end-to-end regression tests with `npm run test:e2e`.
5. Deploy frontend to Vercel with `ENABLE_COMMERCIAL_SUBMISSION="false"` and `ENABLE_ORDER_DESK_REVIEW="false"`.
