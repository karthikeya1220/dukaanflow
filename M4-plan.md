# DukaanFlow M4 — Order Submission and Inventory Reservation

## 1. Scope and implementation boundary

M4 converts one retailer-confirmed M3 cart into one persisted order while
reserving the required inventory atomically. The implementation must preserve
the M0–M3 architecture:

- Supabase SSR authentication remains the source of the authenticated subject.
- `checkRole('RETAILER')` and the trusted `public.users.id` mapping remain the
  Server Action authorization boundary.
- Prisma remains the persistence layer.
- `src/lib/cart-calculation.ts` remains the only calculation engine.
- Client input contains only intent and an idempotency key, never authoritative
  prices, stock, schemes, discounts, or totals.
- All monetary values remain integer paise.
- Free quantities remain separately represented, have zero payable value, and
  consume inventory.
- `Product.inventoryQty` is changed only inside the atomic order-submission or
  reservation-release transaction.

M4 includes:

1. Order and order-line persistence.
2. Transactional inventory reservation at retailer submission.
3. Revalidation of the confirmed cart and current catalogue data.
4. Duplicate-submission protection and safe retry behavior.
5. Minimal retailer submission UI and order result/detail state.
6. Database-backed integration tests and focused Playwright coverage.

M4 does not include:

- Order-desk approval/rejection UI or workflows; those remain M5.
- Tally CSV export; that remains M6 unless the assessment schedule changes.
- AI text, photo, or voice order capture; that remains M7.
- Payments, GST, tax, delivery tracking, notifications, or customer messaging.
- Partial-order approval, line editing after submission, retailer cancellation,
  or general inventory administration.
- Unit conversion or pack-size price conversion.
- A background scheduler. Reservation expiry is stored and handled through an
  explicit release operation/runbook until an operational scheduler is chosen.

`confirmCart()` remains an M3 review confirmation. It is not commercial order
submission and is not an inventory reservation.

## 2. Existing constraints and unresolved business decisions

The current fixtures and M3 model intentionally preserve
`PriceBasis.UNCONFIRMED`. They do not establish whether a displayed price is
per pack or per case. M4 must not infer that meaning.

Before enabling real order submission, the distributor must confirm:

1. Which price basis applies to each product.
2. Whether the confirmed basis is `PER_PACK`, `PER_CASE`, or another business
   concept requiring a future enum change.
3. Whether a product with `UNCONFIRMED` price basis can ever be submitted.
4. Who is authorized to confirm a price basis and whether that confirmation is
   catalogue administration or order-desk approval.
5. Whether reservation expiry is a hard commercial expiry or only an operational
   recovery threshold.

Recommended M4 rule: submission is blocked if any order line is
`UNCONFIRMED`. M3 may display provisional totals and allow cart confirmation,
but no order should reserve stock or become a submitted order until every line
has a distributor-confirmed price basis. This is a deliberate safety rule, not
an inferred price interpretation.

The exact future confirmation workflow is out of scope. M4 should use existing
catalogue fields only and return a safe error explaining that distributor price
confirmation is required.

## 3. Proposed Prisma schema

The migration must be additive. Do not rewrite M0–M3 migrations or change the
meaning of existing cart/product fields.

### 3.1 Enums

Add:

```prisma
enum OrderStatus {
  SUBMITTED
  APPROVED
  REJECTED
}
```

`Order.retailer` is the owning `User` relation and `OrderLine.product` is the
optional `Product` reference used only for traceability. The complete opposite
relations are `User.orders Order[]` and `Product.orderLines OrderLine[]`;
existing `User.carts Cart[]` and `Product.cartLines CartLine[]` remain the
corresponding cart relations. These relation names are unique and must be
used consistently in the Prisma schema; no duplicate relation annotations or
second foreign-key fields are allowed.

`SUBMITTED` is the only status M4 creates. `APPROVED` and `REJECTED` are
reserved for M5 order-desk actions, but defining the complete lifecycle now
keeps the model stable.

If operational expiry must be distinguished from rejection, prefer a separate
reservation state or release metadata rather than adding an M4-only terminal
order status. The initial recommended design treats an expired reservation as
an order transitioned to `REJECTED` by an explicit release operation, with
`rejectionReason = RESERVATION_EXPIRED` or equivalent structured metadata.

### 3.2 Order

Recommended model:

```prisma
model Order {
  id                    String      @id @default(cuid())
  retailerId            String
  cartId                String      @unique
  idempotencyKey        String
  status                OrderStatus @default(SUBMITTED)
  submittedAt           DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  reservationExpiresAt  DateTime
  inventoryReleasedAt   DateTime?
  rejectionReason       String?
  subtotalPaise         Int
  discountPaise         Int
  totalPaise            Int
  priceBasisConfirmed   Boolean
  retailer              User        @relation(fields: [retailerId], references: [id], onDelete: Restrict)
  cart                  Cart        @relation(fields: [cartId], references: [id], onDelete: Restrict)
  lines                 OrderLine[]

  @@index([retailerId, submittedAt])
  @@index([status, reservationExpiresAt])
  @@unique([retailerId, idempotencyKey])
}
```

The concrete field names may be adjusted to repository conventions, but the
following invariants are required:

- `cartId` is unique so one M3 cart confirmation cannot create multiple orders.
- `idempotencyKey` is required for every submission attempt and is unique within
  the authenticated retailer. The Order row is the persisted
  idempotency-key-to-order association; no generic idempotency table is needed.
- `retailerId` is stored for direct ownership filtering and historical access.
- `subtotalPaise`, `discountPaise`, and `totalPaise` are immutable commercial
  results of submission.
- `reservationExpiresAt` is set at submission using the configured 24-hour
  default.
- `inventoryReleasedAt` is a one-time release marker.
- `priceBasisConfirmed` must be true for every M4-created order.
- Order ownership is never inferred from a client-supplied retailer ID.

The existing `Cart` model should gain the minimum state needed to make retries
and post-submission cart handling explicit:

```prisma
enum CartStatus {
  ACTIVE
  CONFIRMED
  SUBMITTED
}

model User {
  // existing fields
  carts  Cart[]
  orders Order[]
}

model Product {
  // existing fields and existing relations
  cartLines  CartLine[]
  orderLines OrderLine[]
}

model Cart {
  id         String     @id @default(cuid())
  retailerId String
  status     CartStatus
  submittedAt DateTime?
  retailer   User       @relation(fields: [retailerId], references: [id], onDelete: Cascade)
  lines      CartLine[]
  order      Order?
}
```

The smallest safe lifecycle design is:

- Keep `CartStatus.SUBMITTED`.
- Remove the current `Cart.retailerId @unique` constraint.
- The intended relation is `User.carts Cart[]`; `Cart.retailerId` is a normal
  foreign-key column with no `@unique` attribute.
- Change the Prisma relation from `User.cart Cart?` to `User.carts Cart[]`.
- Keep `Order.cartId @unique` as the submitted-cart-to-order association.
- Add a database-enforced partial unique index on `Cart(retailerId)` for rows
  whose status is `ACTIVE`, using migration SQL if Prisma schema syntax cannot
  express the PostgreSQL predicate.
- Keep `@@unique([retailerId, idempotencyKey])` on `Order` for
  retailer-scoped idempotency.
- Keep submitted carts immutable and retain their lines for auditability.

This changes M3's “one cart row per retailer” implementation into “one current
ACTIVE cart plus immutable submitted-cart history.” A `Cart.orderId` relation
is not added: `Order.cartId @unique` already provides the association without
duplicating the foreign key. Starting another cart creates a new ACTIVE Cart row only when no ACTIVE row
exists; it never clears, deletes, or reuses a SUBMITTED row.

All M3 cart mutations and `confirmCart()` must reject SUBMITTED carts with a
safe `CART_ALREADY_SUBMITTED` result. The new-cart operation creates the
current ACTIVE row transactionally and must not modify the prior Order or its
CartLines.

The reverse Prisma relation is intentionally `Cart.order Order?`; no redundant
`Cart.orderId` field is added. `Order.cartId @unique` is the single
cart-to-order association and enforces at most one order per submitted cart.

Current-cart and history access are separate operations:

- `getCurrentCart()` returns only the authenticated retailer's `ACTIVE` cart.
- `getCartHistory()` returns that retailer's `SUBMITTED` carts and their
  associated Orders and immutable CartLines.
- `getOrderHistory()` returns retailer-owned historical order snapshots without
  making mutable Product or Scheme rows authoritative.
- Both operations enforce retailer ownership server-side and never expose
  another retailer's carts or orders.

### 3.3 OrderLine

Recommended model:

```prisma
model OrderLine {
  id                    String      @id @default(cuid())
  orderId               String
  productId             String?
  sku                   String
  productName           String
  paidQty               Int
  freeQty               Int
  reservedQty           Int
  sellingUnit           ProductUnit
  inventoryUnit         ProductUnit
  unitPricePaise        Int
  priceBasis             PriceBasis
  grossPaise             Int
  discountPaise         Int
  totalPaise             Int
  schemeKind             SchemeKind?
  schemeId              String?
  schemeBuyQty          Int?
  schemeFreeQty         Int?
  schemeMinQty          Int?
  schemeDiscountBps     Int?
  createdAt              DateTime    @default(now())
  order                 Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product               Product?    @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([orderId])
  @@index([productId])
}
```

The exact scheme snapshot shape can be normalized or JSON-encoded only if the
repository establishes that convention. Prefer explicit nullable scalar fields
for the two supported scheme kinds because they are queryable, type-safe, and
make historical reconstruction deterministic.

Order lines intentionally snapshot:

- Product identity (`productId` when still present, SKU, and product name).
- Paid quantity and calculated free quantity.
- Reserved quantity (`paidQty + freeQty`).
- Selling and inventory units.
- Unit price and price basis.
- Gross, discount, and payable totals.
- The applied scheme identity and parameters.

Historical order rendering must not depend on mutable Product or Scheme rows.
`productId` is a reference only; the snapshot fields are authoritative for the
submitted order.

### 3.4 Reservation representation

Do not add a generic inventory-ledger abstraction in M4 without a demonstrated
requirement. Product inventory is currently represented by
`Product.inventoryQty`. The recommended minimum reservation representation is:

- Conditional decrement of `Product.inventoryQty` at submission.
- `OrderLine.reservedQty` for the exact decrement.
- `Order.reservationExpiresAt`.
- `Order.inventoryReleasedAt` as an idempotent release marker.

This is sufficient for whole-order reservation and release. A separate
`InventoryReservation` table becomes justified only if the business requires
multiple simultaneous holds per product, reservation audit events, partial
release, or a scheduler that queries reservations independently.

## 4. Migration strategy

Create one additive Prisma migration after reviewing the generated SQL.

Expected operations:

1. Add `OrderStatus`.
2. Extend `CartStatus` to include `SUBMITTED`.
3. Create `Order`.
4. Create `OrderLine`.
5. Before changing the uniqueness constraint, query for duplicate `ACTIVE`
   carts per retailer. Migration must stop with an actionable error if any
   duplicates exist; do not silently choose a winner.
6. Preserve every existing `Cart` and `CartLine` row, ID, foreign key, and
   relationship. Existing carts remain `ACTIVE` unless a genuine submitted
   order association already exists; do not fabricate submitted-cart history.
7. Drop the existing unique constraint/index created for
   `Cart.retailerId @unique`.
8. Create an ordinary non-unique index on `Cart("retailerId")` if the query
   plan requires it.
9. Create the partial unique index with migration-managed PostgreSQL SQL:

   ```sql
   CREATE UNIQUE INDEX "Cart_one_active_per_retailer"
   ON "Cart" ("retailerId")
   WHERE "status" = 'ACTIVE';
   ```

10. Add indexes and foreign keys with restrictive behavior for historical data.
11. Add database checks for nonnegative monetary and quantity fields.

Do not:

- Rewrite M0–M3 migrations.
- Drop or rename existing cart/product columns, except for dropping the old
  `Cart.retailerId` uniqueness constraint/index as explicitly required above.
- Add an order migration before the price-basis decision is accepted.
- Run a destructive reset.
- Seed real customer or order data.

Prisma schema syntax and migration SQL must coexist as follows: the Prisma
schema declares `Cart.retailerId` without `@unique` and declares the
`User.carts`/`Cart.retailer` relation, while the PostgreSQL partial index is
created and verified by the migration SQL because Prisma schema syntax cannot
be assumed to express its predicate. Do not remove the SQL index during
subsequent migration generation; review generated SQL and preserve this
manual index.

Before applying:

- Generate the migration without editing unrelated schema history.
- Validate the Prisma schema.
- Review foreign-key delete behavior.
- Run the duplicate-`ACTIVE`-cart check and record that it returned no rows.
- Verify existing M0–M3 users, products, schemes, carts, and cart lines remain
  intact.

After applying:

- Run Prisma Client generation.
- Run migration status.
- Verify the database schema contains the new tables and constraints.
- Verify the old `Cart.retailerId` unique constraint/index is gone.
- Verify the exact `Cart_one_active_per_retailer` predicate and that no
  retailer has more than one `ACTIVE` cart.
- Verify all pre-existing Cart and CartLine IDs, relationships, and quantities
  are preserved and existing retailers still resolve to their same ACTIVE cart.
- Verify existing inventory quantities are unchanged by migration.

### 4.1 Migration recovery and rollback

Before applying the migration, take and verify a restorable database
backup/snapshot, including Cart, CartLine, Product, User, and any existing
inventory data. Record baseline row counts and ordered ID checksums or ID
lists for Cart and CartLine.

If migration execution fails before the partial unique index is created:

- Keep the migration unapplied or roll back only the failed transaction using
  the migration tool's supported recovery.
- Inspect migration history and database metadata before retrying.
- Restore the verified snapshot only if the failed migration left partial
  schema changes that cannot be safely repaired.

If migration execution fails after `Cart_one_active_per_retailer` is created
but before deployment completes:

- Do not remove the index blindly; first verify its definition, duplicate
  ACTIVE-cart absence, and existing Cart/CartLine counts and IDs.
- Either complete the compatible deployment or use a reviewed down-migration
  that removes only objects created by this migration and restores the
  pre-M4 schema, with a second verification of all preserved data.
- Do not expose a partially deployed order-writing application to users.

Once any submitted Order, OrderLine, inventory reservation, or idempotency
association exists, prohibit blind schema rollback. Recovery must be
application-aware and preserve order history, Cart-to-Order relationships,
inventory accounting, and retailer-scoped idempotency records. A verified
backup restore or forward corrective migration must be selected by an
operator; never delete order data merely to make the old schema apply.

After any recovery or retry, verify Cart and CartLine row counts, IDs,
foreign-key relationships, statuses, quantities, the old uniqueness removal,
the partial-index predicate, and inventory quantities against the recorded
baseline.

### 4.2 M3 current-cart compatibility

The M3 implementation currently assumes `retailerId` is globally unique.
Before removing that constraint, update all of these service paths:

- `loadCart`
- `addCartProduct`
- `updateCartLine`
- `removeCartLine`
- `clearCart`
- `confirmCart`

Each current-cart lookup must filter by the authenticated retailer and
`status: 'ACTIVE'`, using `findFirst` or an equivalent status-qualified query,
not `findUnique({ where: { retailerId } })`. `CONFIRMED` carts are no longer
current carts: they remain readable only through an explicit confirmation
result or history-oriented operation and are never returned or mutated by
current-cart operations. Adding a product after confirmation creates or uses a
separate ACTIVE cart. Every line mutation must verify inside its transaction
that the line belongs to the authenticated retailer's ACTIVE cart. Submitted
carts must never be edited, cleared, reconfirmed, or resubmitted. Retailers
with an existing M3 cart must continue to receive that same cart as their
ACTIVE cart after migration; a confirmed M3 cart must be explicitly reopened
or replaced according to the active-cart operation rather than silently
treated as current.

The existing M3 behavior for stale confirmation, server-authoritative
calculation, and ownership isolation remains unchanged for the ACTIVE cart.
Because CONFIRMED carts are no longer current carts, the old M3
`getCartForRetailer()` stale-reopen path is intentionally not used after
confirmation; the confirmation response is the last read of that cart through
the current-cart API, and a new ACTIVE cart is created for subsequent work.
This lifecycle contract change is covered by integration tests rather than
silently retaining a CONFIRMED cart as current.
Submitted-cart history uses separate read-only retrieval rather than the
current-cart service paths.

### 4.3 New-cart creation and concurrency

Implement `createNewCart()` as a retailer-scoped transactional operation:

1. Look up the authenticated retailer's `ACTIVE` cart.
2. If one exists, return that existing cart; do not create or modify another
   row.
3. If none exists, create a new `ACTIVE` cart.
4. If concurrent creation loses the PostgreSQL partial-index uniqueness race
   with `P2002`, boundedly retry and reload the winning ACTIVE cart.
5. If bounded retry cannot resolve the conflict, return a deterministic safe
   `CONFLICT` result.

This operation must never modify or delete submitted carts, cart lines, or
orders. The partial unique index is the final database guarantee that exactly
one ACTIVE cart can be committed per retailer.

Test database safety is fail-closed. Any integration or E2E test that can
create, update, or delete database fixtures requires
`TEST_DB_MUTATIONS=1`, a loopback `DATABASE_URL`, and matching
`TEST_DATABASE_NAME` and `TEST_DATABASE_SCHEMA` values. The expected local
configuration is `TEST_DATABASE_NAME=postgres` and
`TEST_DATABASE_SCHEMA=public`; missing or mismatched values reject the run.

## 5. Atomic submission transaction

Implement a server-only service, for example
`src/lib/order-service.ts`, and a thin Server Action in
`src/app/actions/order.ts`. Reuse existing auth and cart helpers; do not move
authorization into the client or Proxy.

`submitOrder({ cartId, idempotencyKey })` should follow this sequence inside one
interactive Prisma transaction. `cartId` and `idempotencyKey` are intent
identifiers only; ownership, status, and all commercial data are revalidated
server-side.

1. Run `checkRole('RETAILER')`.
2. Resolve the trusted `public.users.id` from the Supabase Auth subject.
3. Validate `cartId` and the idempotency key with Zod. The key must be
   nonempty, bounded, and safe to store. The client must not submit totals,
   product IDs, prices, or retailer IDs as authoritative data.
4. Check whether the requested `cartId` is already `SUBMITTED`, scoped to the
   authenticated retailer, and load its associated Order. Before returning,
   distinguish the authoritative duplicate cases: same retailer + same cart +
   same key returns the existing Order as a successful duplicate; if the key
   already belongs to another cart, return `IDEMPOTENCY_KEY_REUSED`; otherwise
   a different key for this submitted cart returns `CART_ALREADY_SUBMITTED`
   with the authorized existing Order reference. This check occurs before any
   stock mutation.
5. Resolve an existing idempotency record for the same retailer and key. If it
   is associated with another cart, return `IDEMPOTENCY_KEY_REUSED`. If the
   same cart is still being submitted, safely wait/retry or resolve to the
   committed Order. A rolled-back first transaction leaves no successful
   association, so the retry may submit normally.
6. Claim or lock the confirmed ACTIVE cart with a row lock or equivalent
   conditional state guard.
7. Require cart status `CONFIRMED`, nonempty lines, and a non-null
   `confirmedFingerprint`.
8. Re-read current products, active schemes, units, price basis, and inventory
   inside the transaction.
9. Recalculate every line using `calculateLine`/`calculateCart`.
10. Recompute the canonical fingerprint from the fresh rows and compare it to
   `confirmedFingerprint`. Reject with `STALE_CART` if they differ; do not
   reserve stock.
11. Reject inactive/missing products, incompatible units, invalid or ambiguous
    schemes, insufficient stock, and any `UNCONFIRMED` price basis.
12. For each line, conditionally decrement inventory by `requiredStockQty`:

    ```sql
    UPDATE "Product"
    SET "inventoryQty" = "inventoryQty" - $requiredQty,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = $productId
      AND "isActive" = true
      AND "inventoryQty" >= $requiredQty
    ```

    Require exactly one affected row. A zero-row update is a safe conflict or
    insufficient-stock failure. Never read stock once and decrement later
    without a conditional update.
13. Create the Order snapshot and all OrderLine snapshots from the same
    recalculation result.
14. Persist the idempotency-to-order association by creating the Order with the
    unique `(retailerId, idempotencyKey)` identity and unique `cartId`
    association.
15. Mark the cart `SUBMITTED`, set `submittedAt`, and associate it through the
    Order's `cartId`. The cart becomes immutable.
16. Commit only after every inventory update, line insert, order insert,
    idempotency association, and cart state transition succeeds.

Any error rolls back all inventory changes, order rows, order lines, and cart
state changes. No external API calls occur inside the transaction.

### Isolation and locking

The implementation must use the strongest practical PostgreSQL transaction
behavior supported by the configured Prisma adapter. Conditional inventory
updates are mandatory even if rows are read with `FOR UPDATE`.

Recommended approach:

- Serialize submission attempts for the same cart through a conditional cart
  status update or row lock.
- Use conditional product decrements for each required quantity.
- Treat serialization/deadlock errors as bounded retryable conflicts.
- Use a deterministic product-ID ordering for decrements to reduce deadlocks.
- Never use unbounded retries.

The transaction must distinguish:

- `STALE_CART`: fingerprint changed.
- `INSUFFICIENT_STOCK`: conditional decrement affected zero rows.
- `CONFLICT`: concurrent submission or serialization failure after bounded retry.
- `DUPLICATE_SUBMISSION`: successful response containing the existing Order for
the same retailer, cart, and idempotency key; never decrement inventory.
- `IDEMPOTENCY_KEY_REUSED`: the same retailer supplied a key associated with a
  different cart or confirmed fingerprint.
- `PRICE_BASIS_UNCONFIRMED`: commercial submission is blocked.

### 5.1 Idempotency and rollback rules

The idempotency key is a stable, bounded, opaque value generated by the client
for one submission attempt and validated with Zod. It is not a cart total,
fingerprint, or authorization credential. The database enforces
`@@unique([retailerId, idempotencyKey])`.

The Order row, inventory decrements, OrderLines, and Cart state are created or
changed in the same transaction. Therefore:

- A successful transaction creates exactly one idempotency association.
- A timeout or lost response is retried with the same key; the service returns
  the existing Order after checking retailer ownership.
- A transaction rollback leaves no Order and no idempotency record, so retrying
  the same key can safely attempt the transaction again.
- A same-key retry for the same retailer, cart, and confirmed fingerprint
  returns the original Order as a successful duplicate and never decrements
  inventory again.
- A request for an already `SUBMITTED` cart with a different key returns
  `CART_ALREADY_SUBMITTED` with the authorized existing Order reference and
  never mutates stock.
- A same-key request for a different cart or fingerprint returns
  `IDEMPOTENCY_KEY_REUSED` and performs no mutation.
- A same-key concurrent request waits/retries through the unique constraint or
  transaction conflict, then returns the committed winner as a successful
  duplicate; it never decrements inventory twice.
- If the first transaction rolls back, no Order or idempotency association
  remains and a retry may create the order normally.
- The same key may be used by a different retailer because uniqueness is
  retailer-scoped.

The service must not insert a standalone successful idempotency row before
stock reservation. If the unique constraint races, the losing transaction must
reload the committed Order and verify that it matches the request before
returning it.

## 6. Fingerprint and revalidation rules

M4 must reuse the M3 canonical fingerprint implementation and compare it only
with current database data. It must not trust a fingerprint supplied by the
browser.

The submission transaction must re-read and include the same change-detection
fields as M3:

- Product identity.
- Paid quantity.
- Price and price basis.
- Selling and inventory units.
- Current inventory quantity.
- Product active state.
- Active scheme identity and all calculation parameters.

Any difference since M3 confirmation rejects submission as `STALE_CART`.
Submitting must never silently recalculate a changed cart into a different
commercial order.

After a successful submission, the immutable Order/OrderLine snapshots become
the historical record. The original cart is marked consumed/submitted and is
not editable, reconfirmable, or submit-able. A different idempotency key for
that cart returns `CART_ALREADY_SUBMITTED`, never a new order. A retry with the
original key returns the original Order.

To start another cart, the retailer uses a transactional new-cart operation
that creates a new ACTIVE Cart row for the same retailer. The submitted Cart,
its CartLines, and its Order remain unchanged and auditable.

## 7. Reservation lifecycle

### 7.1 Creation

At successful submission:

- Decrement each product by the line's `reservedQty`.
- Set `Order.reservationExpiresAt` to `submittedAt + 24 hours` by default.
- Leave `Order.status = SUBMITTED`.
- Set `Order.inventoryReleasedAt = null`.

The TTL must be configuration-driven, for example
`ORDER_RESERVATION_TTL_HOURS`, with a documented default of 24 hours. Do not
read an unvalidated arbitrary client value.

### 7.2 Approval

Approval is M5. It changes order status from `SUBMITTED` to `APPROVED` with an
atomic status guard. Approval does not decrement inventory again and does not
release the reservation.

### 7.3 Rejection and release

M5 or an operational release service must perform rejection and inventory
release in one transaction:

1. Lock/load the order and lines, or claim it with a conditional
   `WHERE status = 'SUBMITTED' AND inventoryReleasedAt IS NULL` update.
2. Require the current status to be `SUBMITTED`.
3. Require `inventoryReleasedAt IS NULL`.
4. Sort order lines by `productId` (with a stable line-ID tie-breaker) before
   restoring inventory, so concurrent release operations acquire locks in a
   deterministic order.
5. Restore each product by `reservedQty` using conditional, concurrency-safe
   updates. Do not allow a retry to restore a line twice.
6. Set `status = REJECTED`, set the rejection reason, and set
   `inventoryReleasedAt = now()`.
7. Commit all changes together.

If any product restore fails, roll back the entire release. Never mark an order
released before all inventory updates succeed.

Release operations use bounded retries for known serialization/deadlock
conflicts only. After each retry or a lost response, reload the order and
lines, verify whether the status guard committed, and compare each product's
inventory change with the expected total `reservedQty`. A committed release
returns success without applying another restore; an uncommitted release can
be retried safely. If verification cannot establish either outcome, stop
automatic retries and use the manual recovery runbook rather than guessing.

### 7.4 Expiry

M4 stores expiry but does not add a scheduler. A manual or later automated
release operation selects:

- `status = SUBMITTED`
- `reservationExpiresAt <= now()`
- `inventoryReleasedAt IS NULL`

It then uses the same atomic rejection/release transaction. Expiry must not
release inventory twice or release an already approved/rejected order.

Manual recovery runbook:

1. Stop or disable duplicate release workers.
2. Inspect the order and line reservation quantities.
3. Run the status-guarded release transaction.
4. Verify restored inventory and `inventoryReleasedAt`.
5. Record the failure if restoration cannot complete; do not manually mark the
   order released without correcting inventory.

## 8. Server Action contract

Recommended public action:

```ts
submitOrder(input: { cartId: string; idempotencyKey: string }): Promise<
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
>
```

The action must:

- Be marked `'use server'`.
- Validate the idempotency key with Zod.
- Validate the intended `cartId` with Zod and verify it belongs to the
  authenticated retailer.
- Require `RETAILER`.
- Resolve ownership server-side.
- Return safe messages without database error details.
- For `CART_ALREADY_SUBMITTED`, include only the authorized existing `orderId`
  (or an equivalent safe order reference); never include another retailer's
  order data.
- Never expose another retailer's order.
- Return the persisted order snapshot, not client-calculated values.

For retry behavior, use the persisted `Order.idempotencyKey` with the composite
retailer uniqueness constraint. The unique `Order.cartId` association is an
independent guard against submitting one confirmed cart twice. A lost response
is mapped to the existing Order by retailer plus idempotency key.

## 9. Retailer UI flow

Extend the existing M3 cart UI only after the server contract is stable.

1. Show a clear submission summary using server-returned cart values.
2. Disable submission when the cart is empty, stale, unavailable, insufficiently
   stocked, or contains an `UNCONFIRMED` price basis.
3. Require an explicit click and confirmation affordance before submission.
4. Generate or retain one idempotency key per submission attempt.
5. Show pending state and prevent duplicate clicks.
6. On success, show order ID, submitted status, totals, reservation expiry, and
   a clear statement that the order is awaiting order-desk processing.
7. On `STALE_CART`, refresh the cart and require fresh M3 confirmation.
8. On insufficient stock or price-basis failure, preserve the cart and show the
   server-returned safe explanation.
9. Provide a minimal retailer order detail/result view. Do not build order-desk
   controls.

The UI must not display a price as final if its basis is unresolved. Successful
submission should be impossible while any line remains `UNCONFIRMED`.

## 10. Failure and concurrency handling

Required behavior:

| Condition | Result |
|---|---|
| Unauthenticated or wrong role | Structured authorization failure; no database mutation |
| Cart missing, empty, or not `CONFIRMED` | `CART_NOT_CONFIRMED`; no order or stock change |
| Same retailer, same cart, same key | Successful duplicate response with the existing Order; no inventory mutation |
| Same cart with a different key | `CART_ALREADY_SUBMITTED` with the authorized existing Order reference; no mutation |
| Same key associated with another cart | `IDEMPOTENCY_KEY_REUSED`; no mutation |
| Same key and cart while first transaction is in progress | Wait/retry or resolve to the committed Order; never double-decrement |
| First transaction rolls back | No successful idempotency record remains; retry may submit normally |
| Fingerprint differs | `STALE_CART`; cart remains available for review |
| Product inactive/missing | Safe product error; no partial reservation |
| Unit mismatch | Safe validation error; no order |
| Invalid/ambiguous scheme | Safe calculation error; no order |
| Any `UNCONFIRMED` price basis | `PRICE_BASIS_UNCONFIRMED`; no order |
| Conditional stock update affects zero rows | Roll back all lines and return `INSUFFICIENT_STOCK` or `CONFLICT` |
| Two submissions for one cart | Exactly one order; same-key retry succeeds as duplicate, different key returns `CART_ALREADY_SUBMITTED` |
| Two orders compete for one product | At most one succeeds when stock covers only one; no oversell |
| Database/serialization failure | Full rollback; bounded retry only for known retryable conflicts |
| Release called twice | Second call is idempotent and restores no additional stock |

Do not silently reduce quantities, drop lines, change schemes, convert units,
or create a partial order.

## 11. Test plan

### 11.1 Calculation and service unit tests

Preserve all M3 tests and add focused tests for:

- Order-line snapshot mapping from a fresh calculated cart.
- `reservedQty = paidQty + freeQty`.
- Rejection of every `UNCONFIRMED` line.
- Stable order totals and deterministic line order.
- Historical snapshot independence from later Product/Scheme changes.
- Safe mapping of every service error to the public action result.

### 11.2 Database integration tests

Use isolated, timestamped test users/products and explicit cleanup. Never run
against production or a shared database without an environment guard.

Cover:

1. Successful submission creates exactly one Order and all OrderLines.
2. Submitted order contains immutable price, price-basis, scheme, quantity,
   free-quantity, reserved-quantity, and total snapshots.
3. Inventory decrements by paid plus free quantity exactly once.
4. `UNCONFIRMED` price basis blocks submission without changing inventory.
5. Insufficient stock rolls back every prior line decrement.
6. Stale fingerprint blocks submission without changing inventory.
7. Product, scheme, unit, stock, or active-state changes are revalidated.
8. Concurrent submissions for one cart create one order and preserve stock.
9. Concurrent submissions for competing carts cannot oversell.
10. Duplicate retry returns the existing order or a deterministic duplicate
    result without another decrement.
11. Same-key concurrent submissions create one order and decrement once.
12. Different-key submissions against the same confirmed cart create no second
    order and do not decrement inventory twice.
13. A retry after a successful submission returns the original order.
14. A retry after transaction rollback can safely submit once.
15. Same-key requests for a different cart/fingerprint are rejected.
16. Submitted-cart mutations and reconfirmation are rejected.
17. A new cart after submission is a new ACTIVE row; the old cart/order remains
    unchanged.
18. Cross-retailer order access is rejected.
19. Non-retailer submission is rejected.
20. Approved/rejected status guards prevent invalid double transitions.
21. Rejection restores reserved stock once.
22. Repeated release is idempotent.
23. Expired reservation selection is correct under concurrent workers.
24. Failed order-line creation or cart transition rolls back order, cart,
    idempotency association, and stock.
25. No cart from another retailer can be submitted.
26. The migration preserves existing M3 retailer, Cart, and CartLine records,
    IDs, quantities, and relationships.
27. An existing M3 retailer resolves to the same ACTIVE cart after migration.
28. ACTIVE-cart lookup ignores SUBMITTED historical carts.
29. Historical-cart retrieval returns only the retailer's submitted carts and
    associated Orders.
30. Submitted-cart lines remain immutable after a new cart is created.
31. Two concurrent `createNewCart()` calls produce exactly one ACTIVE cart;
    both callers receive the same winner or a deterministic `CONFLICT`.
32. A partial-index `P2002` during new-cart creation is boundedly retried and
    reloads the winning ACTIVE cart.

### 11.3 Playwright tests

Reuse existing authentication fixtures and avoid unnecessary OTP requests.
Add coverage for:

1. Retailer reviews a confirmed cart and sees the submission affordance.
2. `UNCONFIRMED` price basis disables/submission-blocks the action.
3. Successful submission shows order ID, status, totals, and expiry.
4. Cart/order retry does not create a duplicate order.
5. Stale cart response refreshes the UI and requires fresh confirmation.
6. Insufficient stock shows a safe error and preserves the cart.
7. Free quantities are reflected in reserved stock behavior through the
   server-returned result.
8. Unauthenticated users cannot submit or view retailer orders.
9. `ORDER_DESK` cannot submit or access retailer-owned order details.
10. No order-desk approval/rejection controls appear in M4.
11. After successful submission, the retailer can start a new ACTIVE cart
    without changing the submitted cart or its order.
12. If M4 includes history UI, submitted-cart and order-history visibility is
    shown and submitted-cart mutation controls are absent.
13. If history UI is deferred, replace item 12 with the equivalent
    retailer-scoped server-side integration coverage and explicitly defer
    history UI tests to the milestone that implements those screens.
14. Cart and order history from one retailer is not visible to another
    retailer.

Playwright tests must fail fast when pointed at a non-local database. The test
setup must verify `NODE_ENV === 'test'`, an explicit opt-in such as
`ALLOW_DB_MUTATION_TESTS=1`, and a loopback or dedicated disposable
`DATABASE_URL` before any cleanup or mutation. A shared or remote host must be
rejected by default.

## 12. Deployment and operational considerations

- Apply the additive migration before deploying code that submits orders.
- Deploy Prisma Client generated from the same schema.
- Configure and validate `ORDER_RESERVATION_TTL_HOURS`; default to 24 hours.
- Require the database partial unique index for one ACTIVE cart per retailer and
  verify it after migration.
- Ensure database connections support interactive transactions and the chosen
  isolation/locking behavior.
- Monitor conditional stock-update failures, serialization retries, duplicate
  submissions, and release failures.
- Provide an operator-only release/recovery command or documented SQL procedure
  before enabling approval/rejection.
- Do not enable a scheduler without idempotent status and release guards.
- Verify backups include Orders and OrderLines before production rollout.
- Confirm authenticated dynamic routes remain request-time rendered under the
  current Next.js Cache Components configuration.
- Keep secrets in environment configuration; never put service-role keys or
  database credentials in fixtures, plans, or committed source.

## 13. Risks and unresolved decisions

1. **Price basis:** submission must remain blocked until the distributor
   confirms the meaning of each displayed price.
2. **Reservation semantics:** the business must confirm whether decrementing
   `inventoryQty` is the system of record for a reservation or whether a
   separate available/reserved inventory ledger is required.
3. **Order status ownership:** M5 must define who can approve/reject and what
   rejection reasons are permitted.
4. **Expiry authority:** decide whether expiry automatically rejects or first
   enters an operationally reviewable state.
5. **Idempotency key lifetime:** confirm how long clients retain keys and
   whether a submission key may ever be intentionally reused after a terminal
   order state. M4 must reject accidental reuse.
6. **Cart history retention:** confirm retention and deletion policy for
   immutable submitted carts and their lines. M4 must not delete them during
   new-cart creation.
7. **Inventory concurrency:** validate the Prisma/PostgreSQL transaction
   behavior under the deployment adapter, including deadlock retry semantics.
8. **Historical display:** confirm which product and scheme snapshot fields are
   legally/business-required for order reconstruction.

No unresolved decision may be silently replaced with pack-size conversion,
client-side totals, partial reservation, or an invented approval workflow.

## 14. Phased implementation sequence

### Phase 1 — Resolve business decisions

- Obtain distributor confirmation for price basis.
- Decide whether `UNCONFIRMED` submission blocking is mandatory.
- Confirm reservation semantics, expiry authority, release ownership, and cart
  reuse behavior.
- Confirm the persisted idempotency-key strategy and historical snapshot fields.

### Phase 2 — Schema and additive migration

- Add OrderStatus, Order, OrderLine, the persisted idempotency key, and the
  minimum cart submission fields.
- Replace the M3 global cart uniqueness with one ACTIVE cart per retailer plus
  immutable submitted-cart history.
- Add checks, indexes, restrictive foreign keys, and unique duplicate guards.
- Generate and review one additive migration.
- Generate Prisma Client and verify existing M0–M3 data.

### Phase 3 — Server-side order service

- Implement retailer-scoped order retrieval, new-cart creation, and submission
  service.
- Implement fingerprint, fresh calculation, price-basis, availability, and
  stock validation.
- Implement deterministic conditional decrements and bounded conflict retry.
- Persist immutable order snapshots and mark the cart submitted.
- Implement safe structured Server Action errors.

### Phase 4 — Reservation release foundation

- Implement status-guarded rejection/release service without order-desk UI.
- Implement expiry selection and manual recovery command/runbook.
- Add duplicate-release and rollback tests.

### Phase 5 — Retailer submission UI

- Add explicit review/submit confirmation to the M3 cart.
- Add pending, success, duplicate, stale, stock, and price-basis states.
- Add submitted-cart and new-cart states; never render mutation controls for a
  submitted cart.
- Add minimal retailer order detail/result view.
- Preserve M3 cart behavior and server-authoritative rendering.

### Phase 6 — Verification and handoff

- Run Prisma validation/generation/migration status.
- Run calculation, service, integration, and Playwright suites.
- Run build, lint, typecheck, and diff checks.
- Verify no inventory changes occur outside submission/release transactions.
- Document M5 handoff requirements for approval/rejection and order-desk access.

## 15. M5 handoff

M5 may add:

- Order-desk authorization and order queue.
- Atomic approve/reject transitions.
- Rejection reasons and release invocation.
- Retailer order-history visibility if required.

M5 must not trust M4 client state, bypass order ownership, release inventory
without status guards, or treat a submitted order as approved merely because
inventory was reserved.
