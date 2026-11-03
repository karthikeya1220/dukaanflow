# DukaanFlow M4 Phase 3 — Order Submission Plan

**Status: PLAN ONLY — implementation is blocked until the required distributor
decisions are approved.**

This plan describes commercial order submission, inventory reservation, and
retailer order-result behavior after M4 Phase 2. It does not modify
application code, Prisma schema, migrations, database state, dependencies, or
Git history.

## 1. Decision register

| Decision | Current status | Proposed approach | Required approver | Consequence if unresolved |
|---|---|---|---|---|
| Price basis for each catalogue price | `PENDING_DISTRIBUTOR_CONFIRMATION` | Preserve `PriceBasis.UNCONFIRMED`; block commercial submission for every line with that value. Never infer pack/case meaning or multiply by pack size. | Distributor commercial owner / catalogue authority | No commercial order can be submitted safely. |
| Authorized price-basis confirmer and record | `PENDING_DISTRIBUTOR_CONFIRMATION` | Define the authorized role and persist confirmation through the approved catalogue administration process. The order service may only consume the stored basis; it must not authorize or invent one. | Distributor commercial owner and system owner | Submission authorization and audit trail remain undefined. |
| Inventory reservation model | `PENDING_DISTRIBUTOR_CONFIRMATION` | Proposed minimum: atomically decrement `Product.inventoryQty`, store `OrderLine.reservedQty`, `Order.reservationExpiresAt`, and `Order.inventoryReleasedAt`; restore exactly once on rejection/expiry. Compare against an available/reserved ledger before adoption. | Distributor operations and finance/inventory owner | The system cannot know whether `inventoryQty` is available stock, on-hand stock, or a reservation ledger. |
| Reservation expiry duration | `PENDING_DISTRIBUTOR_CONFIRMATION` | Use validated `ORDER_RESERVATION_TTL_HOURS`, currently documented as 24 hours, only after approval. | Distributor operations owner | Expiry timestamps and release selection have no commercial authority. |
| Reservation expiry authority | `PENDING_DISTRIBUTOR_CONFIRMATION` | Decide whether expiry is a hard commercial deadline or an operational review threshold. | Distributor operations owner | Automatic release could be unauthorized or could leave stock blocked. |
| Order rejection and stock release authority | `PENDING_DISTRIBUTOR_CONFIRMATION` | M5 order-desk or an explicitly authorized operational role performs a status-guarded rejection/release operation. No Phase 3 UI should invent approval ownership. | Distributor order-desk owner | Rejection, release, and audit responsibility are unclear. |
| Automatic rejection on expiry | `PENDING_DISTRIBUTOR_CONFIRMATION` | Proposed default is no scheduler in Phase 3; an authorized release operation handles expiry. Automatic rejection remains disabled until approved. | Distributor operations owner | A scheduler could reject valid orders or release inventory without approval. |
| Idempotency-key retention lifetime | `PENDING_DISTRIBUTOR_CONFIRMATION` | Retain the persisted Order association for the approved audit/retry period; reject accidental reuse during retention. | Distributor operations and compliance owner | Long-term retry behavior and storage retention are undefined. |
| Historical product/scheme snapshot requirements | `PENDING_DISTRIBUTOR_CONFIRMATION` | Persist the explicit fields already represented by `OrderLine`; add fields only when the distributor confirms the legal/business reconstruction requirement. | Distributor commercial and compliance owners | Historical order rendering may not satisfy audit or dispute requirements. |
| Price-basis confirmation authority and audit mechanism | `PENDING_DISTRIBUTOR_CONFIRMATION` | Require a durable confirmation record containing the confirmed basis, authorized actor identity, confirmation timestamp, source/evidence reference, and append-only history of changes. The record may be implemented in this database or by a named external catalogue authority only after its API, identity, durability, and audit guarantees are documented. | Distributor commercial owner, catalogue authority, and system owner | Commercial submission cannot prove that a non-UNCONFIRMED basis was authorized. |
| Inventory release evidence model | `PENDING_DISTRIBUTOR_CONFIRMATION` | Compare an inventory movement ledger with operator-controlled reconciliation. Select one model only after proving how release intent, per-product quantities, actor, outcome, retries, and reconciliation evidence survive lost responses and concurrent stock changes. | Distributor operations, finance/inventory owner, and system owner | Exactly-once restoration cannot be proven from an order timestamp alone. |
| Order rejection/release permission boundary | `PENDING_DISTRIBUTOR_CONFIRMATION` | Define the permitted role, server-only service/action, actor identity record, approved rejection reason, and status transition. Do not assume `ORDER_DESK` may reject or release inventory. | Distributor operations owner and security/system owner | An implementation could authorize stock release or rejection to the wrong role. |

**Implementation gate:** recommendations in this document are not approved
business rules. Phase 3 implementation must stop if the distributor has not
approved price-basis authority and audit mechanism, reservation semantics,
expiry authority, rejection/release ownership, release evidence model, and
historical snapshot requirements.

## 1.1 Finding-to-resolution register

| Review finding | Resolution in this revision |
|---|---|
| Price-basis confirmation had no durable actor, timestamp, evidence, or history. | §4.2 now requires a confirmation record or explicitly identified external authority with those guarantees; authority remains pending. |
| Submission locking and retry behavior were not normative. | §6.2 defines the required cart claim, idempotency claim, lock ordering, isolation, retry classes, limits, and duplicate classification. |
| Order-level release timestamp could not prove inventory restoration. | §5.2 and §9 compare a movement ledger with operator reconciliation and require durable per-product evidence; the selected model remains pending. |
| Rejection/release authorization was vague. | §9.3 defines the required permission, service/action, actor, reason, and state-transition contract without assuming `ORDER_DESK` authority. |
| Database safety did not validate the effective schema. | §11.4 requires parsing URL and environment schema settings, rejecting conflicts, and validating the effective target separately for integration and E2E tests. |
| Historical snapshot scope was conditional and incomplete. | §6.5 distinguishes mandatory reconstruction fields from business-dependent fields, including pack and scheme metadata. |
| Approval-dependent tests were presented as generally accepted. | §11.1–§11.3 separate implementable-now tests from decision-gated tests. |
| “Confirmed ACTIVE cart” conflicted with Phase 2. | All submission language now uses ACTIVE current cart, CONFIRMED submission target, and SUBMITTED immutable history. |

## 2. Existing architecture and Phase 2 contract

Phase 3 must preserve:

- Supabase SSR authentication and `checkRole('RETAILER')` as the Server Action
  authorization boundary.
- Trusted `public.users.id` lookup from the authenticated Supabase subject.
- Prisma transactions and the existing generated Prisma Client.
- `src/lib/cart-calculation.ts` as the only calculation engine.
- Integer paise for all monetary values.
- Server-authoritative prices, schemes, stock, units, discounts, and totals.
- No client-supplied retailer ID, product price, stock, scheme, or total as
  authoritative input.

The Phase 2 cart lifecycle is authoritative:

- `ACTIVE` is the only current-cart status.
- `CONFIRMED` is a review-confirmation result, not a current-cart status.
- `SUBMITTED` is immutable historical cart state.
- `getCartForRetailer()` returns only an authenticated retailer's ACTIVE cart.
- `confirmCart()` confirms the ACTIVE cart and returns its confirmation result.
- A later `createNewCart()` creates a separate ACTIVE cart; it does not reuse,
  clear, or mutate the confirmed or submitted cart.
- Submitted-cart and order history are read-only and retailer-scoped.

Phase 3 must not restore the former behavior of treating CONFIRMED as current.
The submission service receives an explicit `cartId` intent, loads the
authenticated retailer's confirmed cart directly, and never relies on
`getCartForRetailer()` to find it.

## 3. Scope and exclusions

### In scope

1. Retailer-authorized commercial submission of one confirmed cart.
2. Fresh server-side cart and catalogue revalidation.
3. Atomic inventory reservation using the approved inventory model.
4. Immutable Order and OrderLine snapshots.
5. Retailer-scoped persisted idempotency and safe retries.
6. Atomic transition of the cart to SUBMITTED.
7. Exactly-once release foundation and expiry handling according to approved
   authority.
8. Structured Server Action responses.
9. Minimal retailer submission/result behavior after the server contract is
   approved.
10. Integration, unit, and applicable Playwright coverage.

### Out of scope

- Order-desk approval/rejection UI and ownership decisions reserved for M5.
- Tally CSV export.
- AI, photo, voice, or text order capture.
- Payments, tax, GST, delivery, notifications, and customer messaging.
- Partial-order approval, retailer cancellation, or line edits after
  submission.
- Unit conversion or pack-size price conversion.
- A background scheduler before expiry authority is approved.
- Any schema or migration change in the planning task.

## 4. Price-basis gate

The seeded values are intentionally unresolved:

- Biscuit: ₹8.10
- Detergent: ₹101.50
- Tea: ₹118

The system must preserve `PriceBasis.UNCONFIRMED`. It must not infer whether a
value is per pack, per case, or another commercial basis, and it must never
multiply by `packSize` as a workaround.

### 4.1 Cart versus commercial order

- M3 cart calculations remain provisional and may display the current integer
  paise result, scheme result, stock warning, and
  `PRICE_BASIS_UNCONFIRMED` warning.
- M3 `confirmCart()` is review confirmation only.
- Commercial submission must reject if any freshly calculated line has
  `priceBasis === 'UNCONFIRMED'`.
- No inventory mutation, Order creation, OrderLine creation, or cart
  SUBMITTED transition may occur before this gate succeeds.
- Commercial Order and OrderLine totals are calculated from fresh server data
  only after the price-basis gate passes.

### 4.2 Authorization and recording

The distributor must define:

1. Which role may confirm a product's price basis.
2. Whether confirmation belongs to catalogue administration or order-desk
   approval.
3. A durable confirmation record containing:
   - the confirmed `PriceBasis`;
   - the authorized actor identity and authority context;
   - confirmation timestamp and effective-from timestamp, if distinct;
   - source/evidence reference;
   - append-only history of prior basis values and corrections.
4. Whether this record lives in the DukaanFlow database or in an explicitly
   identified external catalogue authority. An external authority is acceptable
   only if its API contract, stable record identifier, actor identity,
   timestamps, evidence retention, and availability/failure behavior are
   documented before implementation.
5. Whether changing a basis invalidates existing confirmed carts.

The current Phase 1 schema has `Product.priceBasis` and
`Order.priceBasisConfirmed`, but no confirmer, evidence, or audit-history
fields. Those fields alone cannot prove authorization. Until the mechanism and
approver are approved, Phase 3 consumes only `UNCONFIRMED`/confirmed basis
values supplied by the approved authority and blocks `UNCONFIRMED`; it does
not create or assume a confirmation workflow.

## 5. Inventory model decision

### 5.1 Proposed minimum model — pending approval

`PENDING_DISTRIBUTOR_CONFIRMATION`: on successful submission:

1. Calculate each line's `requiredStockQty` from the fresh calculation.
2. Decrement `Product.inventoryQty` conditionally by that exact quantity.
3. Persist `OrderLine.reservedQty = paidQty + freeQty`.
4. Persist `Order.reservationExpiresAt`.
5. Leave `Order.inventoryReleasedAt` null.
6. Restore each reserved quantity once if an authorized rejection or expiry
   release occurs.

This proposal is compatible with the Phase 1 schema, which already contains
`Order.reservationExpiresAt`, `Order.inventoryReleasedAt`, and
`OrderLine.reservedQty`. It does not make the proposal an approved business
decision.

### 5.2 Trade-offs against an available/reserved ledger

| Model | Benefits | Risks / cost |
|---|---|---|
| Decrement `Product.inventoryQty` and restore on release | Minimal schema; fits current model; conditional updates prevent oversell; easy to query available quantity. | `inventoryQty` becomes an operational reservation balance; release failures and audit history need strong safeguards; on-hand versus available stock is not separately represented. |
| Separate available/reserved/on-hand ledger | Explicit inventory semantics; reservation audit trail; easier reconciliation and multiple holds. | Requires additional schema, accounting rules, release events, reconciliation, and distributor approval; larger implementation scope. |

No ledger model may be implemented until the distributor confirms whether the
existing `Product.inventoryQty` represents available stock and whether
reservation decrement/release is acceptable.

### 5.3 Concurrency invariants

For either approved model:

- Every stock mutation occurs inside the same transaction as Order,
  OrderLine, idempotency, and cart state changes.
- Conditional availability checks are mandatory.
- Product IDs are sorted deterministically before updates.
- Concurrent submissions cannot oversell.
- A failed transaction leaves no partial stock mutation or order.
- Release is protected by a conditional status/release-marker guard.

## 6. Submission service design

Implement only after decision-register approval, as a server-only service such
as `src/lib/order-service.ts` and a thin Server Action such as
`src/app/actions/order.ts`.

### 6.1 Inputs and authorization

The public action accepts only:

```ts
{
  cartId: string
  idempotencyKey: string
}
```

Zod must require a nonempty, bounded, opaque idempotency key and a valid cart
ID. The action must:

1. Run `checkRole('RETAILER')`.
2. Resolve the trusted Prisma retailer ID from the Supabase subject.
3. Reject unauthenticated and wrong-role callers before mutation.
4. Never accept retailer ID, totals, prices, stock, schemes, or product data
   as authoritative input.

All order and cart reads must include authenticated retailer ownership.

### 6.2 Transaction sequence

The following is normative. The transaction must use PostgreSQL `SERIALIZABLE`
isolation configured through the Prisma adapter. If the configured adapter
cannot guarantee that isolation level, implementation is blocked rather than
silently falling back to weaker semantics. Retry at most three times, only for
serialization failures, deadlocks, or a documented unique-constraint race.
Never retry arbitrary database errors.

1. Authenticate and resolve the trusted retailer ID before opening a mutating
   transaction; validate `cartId` and `idempotencyKey` with Zod.
2. Begin the interactive transaction with the approved isolation level.
3. Lock the requested Cart row by `(id, retailerId)` and inspect its status.
   A missing or foreign cart is indistinguishable from unauthorized access.
4. Acquire a transaction-scoped lock for the retailer/key identity
   `(retailerId, idempotencyKey)` (for example, a PostgreSQL advisory lock
   derived from the canonical pair), then read the unique Order identity. This
   lock is required because no row exists to lock before the first Order is
   created. If a committed Order exists, compare its `cartId`: same cart
   returns a duplicate; another cart returns `IDEMPOTENCY_KEY_REUSED`. No stock
   is touched.
5. If the locked cart is `SUBMITTED`, load its one authorized Order and
   classify same-cart/same-key, same-cart/different-key, or key-on-different-
   cart before returning. If it is not `CONFIRMED`, return
   `CART_NOT_CONFIRMED`.
6. Claim the `CONFIRMED` cart inside the transaction using a conditional update
   that succeeds only while it remains `CONFIRMED` and has the stored
   fingerprint. A concurrent claimant must retry classification; it must not
   proceed to product or stock mutation.
7. Load all lines and products, active schemes, price basis, units, and
   inventory. Recalculate and compare the canonical fingerprint. Reject stale,
   unavailable, invalid, ambiguous, or `UNCONFIRMED` data before locking or
   mutating inventory.
8. Sort distinct product IDs ascending. Lock product rows in that order, then
   apply conditional availability updates in the same order. Require one
   affected row per product; zero rows is `INSUFFICIENT_STOCK` or
   `CONFLICT` according to the verified current state.
9. Create the Order and all immutable OrderLine snapshots, including the
   retailer-scoped idempotency association. The unique `(retailerId,
   idempotencyKey)` and `cartId` constraints remain final guards.
10. Transition the claimed cart from `CONFIRMED` to `SUBMITTED` with
    `submittedAt` in the same transaction.
11. Commit. Only the committed winner may return success. A losing request
    reloads the committed cart/Order and applies the duplicate table; it never
    mutates stock before winning the claim.

No external API calls occur inside the transaction.

**Lock ordering:** Cart/idempotency claim first, then distinct Product rows in
ascending product ID, then Order/OrderLine creation and cart transition.
Every release operation uses the same ascending product-ID order. This avoids
lock-order inversions between submission and release.

### 6.3 Confirmed-cart lookup

Because Phase 2 current-cart reads are ACTIVE-only, submission must not call
`getCartForRetailer()` to locate a confirmed cart. It must query the explicit
`cartId` with:

- `id = requested cartId`
- `retailerId = authenticated retailer ID`
- `status = CONFIRMED`

An ACTIVE cart, SUBMITTED cart, missing cart, or foreign cart must not be
silently treated as a confirmed submission target.

### 6.4 Fingerprint and revalidation

Fresh data must include every M3 fingerprint input:

- Product identity and SKU.
- Cart-line paid quantity.
- Price and price basis.
- Selling and inventory units.
- Current inventory quantity.
- Product active state.
- Active scheme IDs and all scheme parameters.

Any difference from the stored confirmation fingerprint returns `STALE_CART`.
The service must not silently recalculate a changed cart into a new order.

### 6.5 Commercial calculations and snapshots

The server creates snapshots from one fresh calculation result. The following
are mandatory to reconstruct the submitted commercial order without current
Product or Scheme rows:

**Order:**

- retailer ownership
- cart association
- idempotency key
- submitted status and timestamp
- reservation expiry
- price-basis-confirmed marker
- subtotal, discount, and total in integer paise

**OrderLine:**

- product ID when available, SKU, and product name
- paid quantity
- free quantity
- reserved quantity (`paidQty + freeQty`)
- selling and inventory units
- unit price and price basis
- gross, discount, and payable totals
- applied scheme identity and parameters

`sellingUnit`, `inventoryUnit`, `sku`, product name, quantities, price basis,
unit price, gross/discount/total, and every parameter used by the applied
scheme are mandatory. `productId` is traceability only and is not sufficient
for historical reconstruction.

`packSize` and `packUnit` must be evaluated explicitly. They are mandatory
snapshots if they are used to interpret the confirmed price, quantity, unit,
or scheme; otherwise they remain optional traceability fields. The distributor
must approve this choice, along with any required product description, scheme
label, effective dates, or catalogue evidence. No implementation may omit
business-dependent fields silently.

Historical rendering uses snapshots, not mutable Product or Scheme rows.

## 7. Idempotency and duplicate-submission contract

The Phase 3 implementation must preserve these authoritative rules:

| Scenario | Required behavior |
|---|---|
| Same retailer + same cart + same key | Return the existing Order successfully as a duplicate; never decrement inventory again. |
| Same cart + different key | Return `CART_ALREADY_SUBMITTED` with only the authorized existing order reference. |
| Same key + different cart | Return `IDEMPOTENCY_KEY_REUSED`; perform no mutation. |
| Same key + same cart while first request is in progress | Safely wait/retry or resolve to the committed Order; produce one Order and one inventory decrement. |
| First transaction rolls back | No successful Order/idempotency association remains; retry may submit normally. |

The requested cart check may occur before the idempotency lookup, but the
service must load the associated Order and distinguish the table cases before
returning. A foreign cart/order must never reveal existence or details.

The database remains the final idempotency guard through:

- `Order.cartId @unique`
- `@@unique([retailerId, idempotencyKey])`

The Order row, OrderLines, stock mutation, idempotency association, and cart
SUBMITTED transition must commit or roll back together.

## 8. Cart lifecycle after successful submission

On success:

1. The confirmed Cart becomes SUBMITTED.
2. Its CartLines and associated Order remain immutable and auditable.
3. The current-cart API no longer returns that cart.
4. A retailer may call `createNewCart()` to receive a separate ACTIVE cart.
5. The new cart must not modify, delete, or reuse the submitted cart.
6. `getCartHistory()` returns only that retailer's submitted carts and orders.

Submitting an already submitted cart with a different key never creates a new
Order. Submitted-cart mutation attempts return `CART_ALREADY_SUBMITTED` through
the service/action contract. Missing or foreign carts remain indistinguishable
from unauthorized access where necessary to preserve isolation.

## 9. Reservation expiry and exactly-once release

### 9.1 Expiry

The TTL must be configuration-driven and validated. The currently documented
24-hour value is only a proposal pending distributor approval.

Until expiry authority is approved:

- Store expiry metadata only.
- Do not add a scheduler.
- Do not automatically reject or release stock.
- Provide an operator runbook for inspection, not an unauthorized automatic
  state transition.

### 9.2 Release transaction

For an approved rejection/release operation:

1. Load the Order and OrderLines by authorized ownership or operational role.
2. Conditionally claim only a SUBMITTED order with
   `inventoryReleasedAt IS NULL`.
3. Sort lines by product ID, then stable line ID.
4. Restore each `reservedQty` through the approved inventory model.
5. If any restore fails, roll back every restore and the release marker.
6. Set the approved rejection state/reason and `inventoryReleasedAt` together.
7. Commit atomically.

Release retries are bounded and limited to known serialization/deadlock
errors. An order-level `inventoryReleasedAt` is only a state marker; it does
not prove that every product was restored. After a timeout or lost response,
reload the durable release evidence and product quantities. If the committed
outcome cannot be proven, stop automatic retries and use the approved
reconciliation process rather than guessing.

### 9.3 Release evidence and authorization

The distributor must choose one of these models; both remain
`PENDING_DISTRIBUTOR_CONFIRMATION`:

| Model | Lost response and retries | Concurrent unrelated stock changes | Exactly-once evidence |
|---|---|---|---|
| Inventory movement ledger | One transaction writes a unique release operation and one per-product movement for each reserved quantity, then updates the Order marker. A retry resolves the unique operation before applying movement. | Product quantity is changed conditionally, while the movement records identify the exact order, product, quantity, actor, and operation. Reconciliation can compare ledger totals with inventory. | Durable operation ID, per-product movement IDs, before/after or signed quantity deltas, actor, timestamp, and committed release status. |
| Operator-controlled reconciliation | A lost response stops automatic retry. An operator locks the order, records a reconciliation case, proves the stock delta from a baseline and competing movements, then completes one guarded release. | Current quantity alone is insufficient; the operator must account for unrelated movements and retain the evidence used to distinguish them. | Durable case ID, actor, evidence references, per-product expected/restored quantities, verification result, and final guarded status marker. |

The minimum durable evidence is therefore an operation or case identifier,
order ID, actor identity, timestamp, authorized reason, per-product and
per-line quantities, attempt/outcome history, and a committed status marker.
The current Phase 1 order-level timestamp alone is insufficient. If the
ledger model is selected, the existing schema requires an approved additive
migration for movement records; if reconciliation is selected, the runbook
and evidence store must be explicitly identified before implementation.

The release boundary must be a server-only service and a separately
authorized Server Action. It must record the authenticated actor, approved
reason, and operation/case identifier. `ORDER_DESK` is not presumed to have
this permission. The approved role, whether rejection and release are one
operation, and the allowed transitions (`SUBMITTED` to `REJECTED`, or another
approved state) remain business decisions.

## 10. Error and Server Action contract

The planned action returns safe structured results:

```ts
type SubmitOrderResult =
  | {
      ok: true
      order: RetailerOrderView
      duplicate: boolean
    }
  | {
      ok: false
      code:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'INVALID_INPUT'
        | 'CART_NOT_CONFIRMED'
        | 'CART_ALREADY_SUBMITTED'
        | 'IDEMPOTENCY_KEY_REUSED'
        | 'STALE_CART'
        | 'PRICE_BASIS_UNCONFIRMED'
        | 'PRODUCT_UNAVAILABLE'
        | 'INCOMPATIBLE_UNITS'
        | 'INVALID_SCHEME'
        | 'INSUFFICIENT_STOCK'
        | 'CONFLICT'
        | 'INTERNAL_ERROR'
      message: string
      orderId?: string
    }
```

Additional release operations require a separate authorization contract and
must not be exposed through the retailer submission action.

Safe messages must not expose raw database errors, another retailer's order,
or whether a foreign cart exists.

## 11. Testing and database safety

### 11.1 Tests implementable before business approval

Add focused tests for:

- `UNCONFIRMED` price-basis rejection for every line.
- No pack-size conversion.
- Stable deterministic order-line sorting and totals.
- `reservedQty = paidQty + freeQty`.
- Snapshot mapping independent of later Product/Scheme changes for the
  currently defined mandatory fields.
- All service errors mapping to safe Server Action responses.
- Same-key duplicate and different-key conflict classification.
- Rollback leaves no successful idempotency result.
- Cart claim ordering and no inventory mutation before the winning claim.
- Bounded retry classification for serialization/deadlock/unique races.

### 11.2 Decision-gated tests

These tests are specified but cannot be accepted until their governing
decisions are approved:

- price-basis actor/evidence persistence;
- inventory movement-ledger or reconciliation evidence;
- release authorization and actor recording;
- expiry selection and automatic rejection policy;
- mandatory business-dependent pack/scheme snapshot fields.

### 11.3 PostgreSQL integration tests

Use isolated timestamped fixtures and the existing fail-closed safety guard.
The guard requirements are normative in §11.4:

- `TEST_DB_MUTATIONS=1`
- loopback `DATABASE_URL`
- expected `TEST_DATABASE_NAME`
- expected `TEST_DATABASE_SCHEMA=public`

Required cases:

1. Successful submission creates one Order and complete OrderLines.
2. Cart fingerprint and all catalogue fields are revalidated.
3. `UNCONFIRMED` blocks submission without changing stock.
4. Confirmed price basis permits submission only after approved catalogue
   authorization exists.
5. Conditional stock updates prevent oversell.
6. Multi-line stock failure rolls back every prior decrement.
7. Concurrent submissions for one cart create one Order and one decrement.
8. Competing carts cannot oversell one product.
9. Same-key sequential and concurrent retries return the existing Order.
10. Different-key retry returns `CART_ALREADY_SUBMITTED`.
11. Same key on another cart returns `IDEMPOTENCY_KEY_REUSED`.
12. Rollback leaves no Order or idempotency association.
13. Submitted cart remains immutable.
14. New ACTIVE cart creation preserves submitted history.
15. Historical cart/order access is retailer-scoped.
16. Foreign cart and foreign order data are not exposed.
17. Release restores stock exactly once **only after the release evidence model
    and authorization are approved**.
18. Release timeout/retry is idempotent and bounded **under the approved
    evidence model**.
19. Expiry selection obeys the approved authority **only after expiry policy
    approval**.
20. No M4 operation mutates inventory before all validation passes.

### 11.4 Database safety requirements

All integration tests that mutate fixtures require explicit
`TEST_DB_MUTATIONS=1`, a parseable `DATABASE_URL`, loopback host, expected
database name, and expected schema. The guard must validate the effective
schema from the URL and reject:

- a URL `schema` parameter that conflicts with `TEST_DATABASE_SCHEMA`;
- an environment schema setting that conflicts with the URL;
- missing, malformed, or non-`public` effective schema;
- a database name or host outside the explicit expected target.

The plan does not modify `tests/test-database-safety.ts`; implementation of
this requirement belongs to a later approved code change.

Integration tests must call the guard before fixture creation, reset, or any
write. E2E tests must call equivalent validation before browser setup that
can trigger fixture mutation, database reset, cart cleanup, or seed changes;
read-only browser tests may run without mutation opt-in only if they cannot
reach a mutating setup path. Missing opt-in or target metadata fails closed.

### 11.5 Playwright tests

Only add UI tests for screens included in Phase 3:

- Confirmed cart displays a submission affordance.
- UNCONFIRMED basis blocks submission and shows a provisional explanation.
- Successful submission shows order ID, submitted status, snapshots/totals, and
  expiry metadata only after approval of the expiry policy.
- Same-key retry does not create a second order.
- Stale cart and insufficient stock preserve the cart and show safe errors.
- Successful submission allows a new ACTIVE cart without altering history.
- Submitted cart has no mutation controls.
- Unauthenticated and ORDER_DESK users cannot submit or view retailer orders.
- If history UI is deferred, use server-side integration coverage and defer UI
  history tests explicitly.

Browser tests must fail closed before any fixture mutation when any required
test opt-in, loopback host, expected database, or effective schema check is
missing or contradictory.

## 12. Failure, rollback, and concurrency rules

- Validate everything before the first stock mutation.
- Use one interactive transaction for stock, Order, OrderLines, idempotency, and
  cart state.
- Sort product IDs before conditional updates.
- Retry only bounded, known serialization/deadlock/P2002 conflicts.
- Do not retry arbitrary database errors as successful operations.
- A transaction rollback removes stock changes, Order, OrderLines,
  idempotency association, and cart transition together.
- A lost response is resolved by retailer-scoped idempotency lookup.
- A duplicate response never performs a second stock mutation.
- If outcome verification is impossible after timeout, stop and use recovery
  procedures.

## 13. Proposed implementation phases

### Phase 0 — Business approval gate

Obtain written approval for:

1. Price basis and authorized confirmer/record, including database versus
   external authority and audit history.
2. Inventory decrement versus available/reserved ledger.
3. Reservation duration and expiry authority.
4. Rejection/release ownership, permission boundary, actor recording, and
   status transition.
5. Automatic expiry rejection.
6. Historical snapshot and retention requirements, including pack and scheme
   fields.
7. Release evidence model and recovery authority.

**No implementation may begin before this gate is complete.**

### Phase 1 — Contract and test fixtures

- Finalize approved error and result contracts.
- Define approved inventory and expiry semantics.
- Add unit fixtures for confirmed price bases without changing production data.
- Verify test database safety configuration.

### Phase 2 — Submission service

- Implement authenticated explicit-cart lookup for CONFIRMED carts.
- Revalidate fingerprint, calculations, price basis, schemes, units, and stock.
- Implement approved conditional inventory mutation.
- Create immutable snapshots and idempotency association.
- Mark the cart SUBMITTED atomically.

### Phase 3 — Duplicate and concurrency hardening

- Add same-key/different-key classification.
- Add same-key concurrent retry resolution.
- Add competing-cart oversell tests.
- Add rollback and serialization/deadlock retry tests.

### Phase 4 — Release foundation

- Implement approved status-guarded release only after the release evidence
  model and authorization contract are approved.
- Add deterministic release ordering, bounded retries, lost-response recovery,
  and exactly-once verification.
- Do not expose unauthorized approval/rejection UI.

### Phase 5 — Retailer result flow

- Add minimal submit confirmation and server-result rendering.
- Preserve provisional versus commercial totals.
- Add submitted-cart immutability and new ACTIVE-cart flow.
- Add only the approved UI/history surface.

### Phase 6 — Acceptance and handoff

- Run unit, PostgreSQL integration, Playwright, lint, typecheck, Prisma
  validation, migration status, and diff checks.
- Verify no schema/migration changes outside an separately approved migration.
- Review inventory and order audit evidence.
- Obtain distributor sign-off before enabling commercial submission.

## 14. Risks and limitations

1. Price basis remains unresolved; commercial submission must stay blocked.
2. Inventory decrement/release is only a proposal until the distributor
   approves its semantics and evidence model.
3. Expiry automation may be unsafe without an authorized owner and policy.
4. Existing Phase 1 metadata supports minimum reservations but not a full
   inventory movement ledger or release proof.
5. Phase 2's ACTIVE-only current-cart contract means submission must use
   explicit CONFIRMED-cart lookup and must not reuse current-cart helpers.
6. Historical snapshots may require additional approved fields for legal or
   distributor disputes.
7. Idempotency retention and terminal-order reuse policy remain unresolved.
8. Database-target safety requires implementation changes to validate the
   effective connection schema; this plan does not make those changes.

## 15. Plan-only acceptance statement

This document is a design proposal, not implementation approval. Required
business approvals must be recorded before any Phase 3 code, schema, migration,
database, UI, inventory mutation, reservation release, or order creation work
begins.
