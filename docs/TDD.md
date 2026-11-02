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

## Inventory reservation (explicit implementation assumption)

- Stock is **reserved transactionally at order submission**: per-line conditional
  `UPDATE … SET stock_qty = stock_qty - :qty WHERE id = :product AND stock_qty >= :qty`
  inside the single submit transaction. **All-or-nothing:** any failure rolls back every line —
  zero partial rows, zero leaked reservations. Enforced by an integration test (M4).
- `orders.reserved_at` is set on submission. Reservation is **released when the order is
  rejected** (restore stock in the same transaction as the status change). Approval does not
  move stock.
- Expiry policy: `ORDER_RESERVATION_TTL_HOURS` (default 24) is **documentation only** — no
  scheduler in v1. Manual release runbook: restore `stock_qty` for the order's lines, insert a
  `RELEASED` event, set status `REJECTED`.
- Overselling is impossible: catalogue shows live sellable stock; submission re-checks it.

## Financial precision

- All money is integer **paise**. Percentage discounts are computed in basis points and
  **rounded down to the nearest paise** (`Math.floor`) — the distributor absorbs rounding.
- **Free quantities have zero payable value and consume stock** (`qty + free_qty` decremented).
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

## Schemes

- Exactly the two specified rules, typed and deterministic:
  `BUY_X_GET_Y {buyQty:10, freeQty:1}` and `THRESHOLD_PERCENT {minQty:5, bps:300}`.
- No general stacking framework. Seed data scopes the two schemes to distinct products; if a line
  ever qualifies for both, fixed order = free-units first, then percentage on the remainder
  (documented default, changeable in one function).

## Tally export

- Deterministic CSV of approved orders (stable column/row order, RFC-4180 escaping,
  paise→rupees at 2 decimals). **No production Tally voucher format was provided** — none is
  invented; output is re-mappable when the real format arrives.

## Scope

- Single distributor tenant. Tax/GST, payments, notifications, password reset, scheme admin UI:
  out of scope (v1).
