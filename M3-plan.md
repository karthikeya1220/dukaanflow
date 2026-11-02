# M3 — Retailer Cart and Scheme Calculation

## Scope and implementation boundary

M3 extends the committed M2 catalogue into a persistent, retailer-scoped cart
and a deterministic calculation engine. It does not create orders, reserve or
decrement stock, notify users, export Tally files, or invoke AI order capture.
The cart may be explicitly confirmed as ready for the next stage, but that
confirmation is not an order submission.

The implementation must reuse the M1 `requireRole('RETAILER')` and
`checkRole('RETAILER')` boundaries, the M2 integer-paise `Product` model, and
the existing Prisma 7/PostgreSQL setup. All authoritative prices, stock, and
schemes are read from the database on the server.

## Proposed Prisma schema

Add only cart state and cart lines. Do not add `Order`, `OrderLine`,
reservation, approval, or inventory-ledger models in M3.

```prisma
enum CartStatus {
  ACTIVE
  CONFIRMED
}

model Cart {
  id          String     @id @default(cuid())
  retailerId  String     @unique
  status      CartStatus @default(ACTIVE)
  confirmedAt DateTime?
  confirmedFingerprint String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  retailer    User       @relation(fields: [retailerId], references: [id], onDelete: Cascade)
  lines       CartLine[]
}

model CartLine {
  id           String   @id @default(cuid())
  cartId       String
  productId    String
  quantity     Int
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  cart         Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product      Product  @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([cartId, productId])
  @@index([cartId])
  @@index([productId])
}
```

`User` and `Product` receive the corresponding relation fields. The existing
`User.role` remains the authorization source; `retailerId` is the application
`User.id`, not a client-provided Auth subject.

### Ownership and active-cart policy

The unique `Cart.retailerId` constraint gives each retailer one persistent
cart. `ACTIVE` is the mutable state. `CONFIRMED` remains available for M4
handoff and is revalidated whenever it is displayed or consumed. M3 does not
create a second cart after confirmation because that would make the handoff
ambiguous. If current data differs from `confirmedFingerprint`, the server
must transactionally set the cart to `ACTIVE`, clear `confirmedAt` and
`confirmedFingerprint`, and return a visible `STALE_CART` warning; no order is
created.

This is a safe default because the requirement is one active retailer cart and
the next stage needs the confirmed contents to remain addressable. If the
business later requires editing while retaining an immutable confirmed
snapshot, that is an M4/order-boundary decision, not a reason to add order
models in M3.

### Price storage decision

Cart lines store only `productId` and requested paid `quantity`. They do not
store price, discount, stock, or scheme snapshots. Every read, mutation,
calculation, and confirmation re-reads current `Product` and active `Scheme`
rows. This prevents stale client values from becoming authoritative.

To detect changes after confirmation without duplicating commercial data, the
server computes a deterministic fingerprint from sorted cart lines. Each line
contributes its product identity, line quantity, price and price basis, selling
and inventory units, current inventory quantity, and all active scheme
parameters. The canonical representation must use stable field names and
ordering before hashing. Serialize the canonical object as stable JSON with
sorted lines by `productId`, and sorted schemes by `kind`; use explicit
`null` values for absent optional scheme parameters. Hash the UTF-8 JSON bytes
with SHA-256 and encode the digest as lowercase hexadecimal. Each line's
canonical record must include `productId`, `sku`, `quantity`, `pricePaise`,
`priceBasis`, `packSize`, `packUnit`, `sellingUnit`, `inventoryQty`,
`inventoryUnit`, `productIsActive`, and its active schemes' `id`, `kind`,
`buyQty`, `freeQty`, `minQty`, `discountBps`, and `isActive`. The resulting
`confirmedFingerprint` is only a change detector; it is not a price snapshot,
inventory reservation, or commercial approval.

## Server action contracts

All actions are server-only functions. Inputs are parsed with Zod before any
database operation. The authenticated retailer is derived from
`getCurrentUserWithRole()`/`checkRole('RETAILER')`; no action accepts a
retailer ID, Auth subject, price, stock, discount, scheme, or total as
authoritative input.

Recommended result shape:

```ts
type CartActionResult =
  | { ok: true; cart: CartView }
  | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' |
      'PRODUCT_UNAVAILABLE' | 'STALE_CART' | 'CONFLICT' | 'INTERNAL_ERROR';
      message: string }
```

The message must be safe for the UI and must not expose database details.

### Add product

```ts
addCartProduct(input: { productId: string; quantity: number })
```

- Require `RETAILER`.
- Require a nonempty product ID and positive integer quantity.
- Reject inactive or missing products.
- Create the retailer's cart if needed, or update the existing unique line.
- Re-read the product and active schemes inside the transaction.
- Do not reject solely because the requested quantity exceeds current stock;
  retain the cart line and return an insufficient-stock warning so the
  retailer can correct it. M3 does not reserve stock.
- If the cart is `CONFIRMED`, reopen it as `ACTIVE` before the mutation and
  show that confirmation was invalidated. Reopening clears both `confirmedAt`
  and `confirmedFingerprint`.

### Update quantity

```ts
updateCartLine(input: { lineId: string; quantity: number })
```

- Require a positive integer quantity; zero is represented by remove.
- Locate the line through `cartId` owned by the authenticated retailer.
- Never update by `lineId` alone.
- Re-read current product/scheme data and return recalculated warnings.
- If the cart is `CONFIRMED`, set it to `ACTIVE` and clear both
  `confirmedAt` and `confirmedFingerprint` before applying the quantity
  change; the response must indicate that fresh confirmation is required.
- Reject an inactive product with a clear unavailable result while preserving
  the line for review/removal, or mark it stale in the returned view. The
  recommended UI behavior is to keep the line visible and disable checkout
  confirmation until removed or reactivated.

### Remove line

```ts
removeCartLine(input: { lineId: string })
```

Delete only a line belonging to the authenticated retailer's cart. A missing
or already-removed line returns an idempotent success-shaped current cart
result rather than affecting another cart. The mutation clears
`confirmedAt` and `confirmedFingerprint` and sets the cart to `ACTIVE`.

### Clear cart

```ts
clearCart()
```

Delete all lines for the authenticated retailer's cart in one transaction.
Keep the cart row and set it to `ACTIVE`, clearing `confirmedAt` and
`confirmedFingerprint`.

### Fetch current cart

```ts
getCurrentCart()
```

Require `RETAILER`, load the owned cart and lines, then fetch current active
products and schemes. Products that became inactive must remain represented as
unavailable lines so the retailer can remove them. Missing product rows are
reported as stale data, not silently dropped. If the cart is `CONFIRMED`,
compute the current fingerprint; when it differs from `confirmedFingerprint`,
atomically reopen the cart, clear both confirmation fields, and return
`STALE_CART`.

### Confirm cart for M4

```ts
confirmCart()
```

Require `RETAILER`, load the owned cart, recalculate it from current database
values, and reject confirmation when any line is inactive, missing, or
insufficiently stocked after paid and free quantities are considered. On
success, compute the current deterministic fingerprint and set
`status = CONFIRMED`, `confirmedAt = now()`, and
`confirmedFingerprint = fingerprint`; do not write an order, stock
reservation, notification, or export record.

Every later mutation clears `confirmedAt` and `confirmedFingerprint`, sets the
cart to `ACTIVE`, and requires a fresh review/confirmation. A fetch/review
also compares the stored fingerprint against current product, stock, unit,
price, price-basis, scheme, and quantity data, reopening the cart and returning
`STALE_CART` when they differ.

## Transaction boundaries and stale writes

Cart creation, line upsert/increment, quantity update, removal, and clear are
database transactions. The transaction must scope every read/write by the
trusted retailer's `User.id`. The unique `(cartId, productId)` constraint is
the final duplicate-line guard; concurrent add operations must handle a unique
conflict by retrying the current line read or returning `CONFLICT`.

M3 does not reserve stock. Stock checks are therefore advisory during ordinary
cart mutation and authoritative only for M3 confirmation's current review.
M4 must repeat stock validation atomically in the order-submission transaction;
M3 confirmation must never be treated as a reservation.

## Pure scheme calculation engine

Create a framework-independent module such as
`src/lib/cart-calculation.ts`. It must import neither React, Next.js, Prisma,
Supabase, nor database clients.

```ts
type CalculationScheme =
  | {
      kind: 'BUY_X_GET_Y'
      buyQty: number
      freeQtyPerMultiple: number
      sellingUnit: 'PIECE' | 'PACK' | 'CASE'
    }
  | {
      kind: 'THRESHOLD_PERCENT'
      minQty: number
      discountBps: number
      sellingUnit: 'PIECE' | 'PACK' | 'CASE'
    }

type CalculationInput = {
  quantity: number                 // paid/requested selling units
  unitPricePaise: number           // supplied price, never pack-multiplied
  priceBasis: 'UNCONFIRMED' | 'PER_PACK' | 'PER_CASE'
  sellingUnit: 'PIECE' | 'PACK' | 'CASE'
  inventoryUnit: 'PIECE' | 'PACK' | 'CASE'
  availableStock: number           // current inventory unit
  scheme: CalculationScheme | null
}

type CalculationResult = {
  paidQty: number
  freeQty: number
  requiredStockQty: number
  unitPricePaise: number
  priceBasis: 'UNCONFIRMED' | 'PER_PACK' | 'PER_CASE'
  grossPaise: number
  discountPaise: number
  totalPaise: number
  qualifiedScheme: boolean
  stockStatus: 'AVAILABLE' | 'INSUFFICIENT' | 'OUT_OF_STOCK'
  warning?: 'PRICE_BASIS_UNCONFIRMED' | 'INSUFFICIENT_STOCK'
}

function calculateLine(input: CalculationInput): CalculationResult
function calculateCart(lines: CalculationInput[]): CartCalculationResult
```

### Deterministic rules

1. `quantity` is paid quantity in the product's `sellingUnit`.
2. `BUY_X_GET_Y` qualifies only for complete multiples. After validating
   `inventoryUnit === sellingUnit`, calculate the distinct result value
   `calculatedFreeQty = floor(paidQty / scheme.buyQty) *
   scheme.freeQtyPerMultiple`. The database's existing `Scheme.freeQty` field
   maps to the engine's `freeQtyPerMultiple` parameter; the calculated result
   remains `freeQty`.
3. `THRESHOLD_PERCENT` qualifies when paid `quantity >= minQty`.
4. Threshold qualification is based on paid units, not paid plus free units.
5. Free units are displayed separately, have zero payable value, and consume
   stock. Required stock is `paidQty + freeQty`.
6. If available stock is below required stock, retain the calculated benefit
   for transparency but mark the line `INSUFFICIENT`; confirmation is blocked.
   The engine must not silently reduce the requested quantity or free units.
7. A zero-stock line is `OUT_OF_STOCK` whenever required stock is positive.
8. No scheme means zero free units and zero discount.
9. Discount is `floor(grossPaise * discountBps / 10_000)`. Totals remain
   integer paise: `grossPaise - discountPaise`.
10. Prices are used exactly as stored. `packSize` is never involved in money
    arithmetic.
11. The engine returns the supplied price basis separately so callers can
    display the unresolved warning; it does not reinterpret `UNCONFIRMED`.
12. M3 requires `inventoryUnit === sellingUnit` for every calculation. An
    incompatible product is rejected with a safe validation error; M3 does not
    implement unit conversions.

### Multiple schemes and application order

The current M2 seed gives each product at most one active scheme, and M3
supports exactly the two existing kinds. The safe default is to reject
ambiguous multiple active schemes for one product during calculation rather
than invent stacking behavior. If a future data migration permits both kinds,
the documented fallback order is free units first, then percentage discount on
the paid gross amount; this is not a generic promotion engine and must remain
an explicit function branch.

### Fixture examples

| SKU | Paid quantity | Free quantity | Discount | Required stock | Result |
|---|---:|---:|---:|---:|---|
| `SKU-BS-075` | 20 CASE | 2 CASE | ₹0.00 | 22 CASE | `20 × ₹8.10`, subject to stock |
| `SKU-BS-075` | 15 CASE | 1 CASE | ₹0.00 | 16 CASE | `15 × ₹8.10`, subject to stock |
| `SKU-DT-1KG` | 5 CASE | 0 CASE | floor(₹507.50 × 300 / 10,000) = ₹15.22 | 5 CASE | ₹492.28 |
| `SKU-DT-1KG` | 4 CASE | 0 CASE | ₹0.00 | 4 CASE | ₹406.00 |
| `SKU-TE-250` | 1 CASE | 0 CASE | ₹0.00 | 1 CASE | ₹118.00, subject to stock |

These are provisional totals because all fixture `priceBasis` values are
`UNCONFIRMED`. The engine must not call them commercially final.

## Price-basis ambiguity

The M2 `Product.priceBasis` remains `UNCONFIRMED`, and `pricePaise` must be
used verbatim. M3 may safely display provisional arithmetic because it does
not alter or reinterpret the stored value, provided every cart view shows a
prominent warning:

> Provisional total: price basis is unconfirmed. Distributor confirmation is
> required before order submission.

The cart should display unit price, price basis, discount, subtotal, and
provisional total in paise-derived rupees. It must not multiply ₹8.10 by 96,
₹101.50 by 20, or ₹118.00 by 40. M4 must revalidate the basis before treating
an order total as commercially final. GST, tax, and payment calculations stay
out of M3.

## Stock handling

M3 never reserves or decrements inventory. On every cart fetch, mutation,
calculation, and confirmation, compare current `Product.inventoryQty` against
`paidQty + freeQty`.

Display:

- `AVAILABLE` when required stock is available.
- `INSUFFICIENT` when stock is positive but below required stock.
- `OUT_OF_STOCK` when stock is zero and required stock is positive.
- A separate inactive/unavailable state when the product is inactive or
  deleted.

An insufficient line remains visible and editable. Confirmation is disabled
until all lines pass current stock and active-product checks. If stock changes
after confirmation, the next review marks the cart stale and requires fresh
confirmation. M4 repeats the check atomically and is the only stage allowed
to decrement stock.

## Retailer UI flow

Reuse the authenticated retailer layout and existing shadcn/ui conventions.
M2 catalogue cards gain an `Add to cart` control using the product ID only.
The client sends quantity and product ID, never price, stock, discount, or
scheme data.

Provide a mobile-friendly `/retailer/cart` page or cart section with:

- Product name and SKU.
- Paid quantity controls and remove action.
- Free quantity shown separately.
- Current active scheme summary.
- Unit price and explicit `unconfirmed` price basis.
- Line subtotal, discount, and provisional line total.
- Current stock and required stock.
- Insufficient, out-of-stock, inactive, and stale warnings.
- Cart subtotal, total discount, and provisional total.
- A prominent price-basis warning.
- `Review cart` followed by explicit `Confirm for next stage`.

Use server-rendered initial data and server actions for mutations. Keep controls
usable on low-bandwidth mobile connections; avoid optimistic financial totals.
After each mutation, re-fetch/revalidate the cart from the server.

Confirmation is a state transition only. It stores the current fingerprint
and leaves the cart available for M4. Any product, price, scheme, unit, or
stock change invalidates that fingerprint: the next review reopens the cart,
clears both confirmation fields, and requires fresh confirmation. No order or
inventory record is created.

## Migration strategy

1. Add `CartStatus`, `Cart`, and `CartLine` to `prisma/schema.prisma`.
2. Add `Cart` relation fields to `User` and `CartLine` relation fields to
   `Product`.
3. Create one additive Prisma migration; do not rewrite M0, M1, or M2
   migrations.
4. Add the unique retailer ownership constraint, unique cart/product line
   constraint, and lookup indexes.
5. Add positive-quantity check constraints for `CartLine.quantity` and valid
   `Cart.status` through the enum.
6. Generate Prisma Client and run migration status.
7. Seed changes are not required for cart rows; existing product/Auth seed
   behavior must remain unchanged.
8. Apply the migration against local Supabase PostgreSQL and verify existing
   M1/M2 rows remain intact.

No destructive reset or data rewrite is required.

## Test plan

### Pure unit tests

Cover:

- `BUY_X_GET_Y` nonqualification below the threshold.
- One and multiple complete buy-quantity multiples.
- No partial free-unit multiple.
- `THRESHOLD_PERCENT` qualification at and above `minQty`.
- Threshold nonqualification below `minQty`.
- Discount rounding down to integer paise.
- No-scheme behavior.
- Free quantities and required-stock calculation.
- Zero stock and insufficient stock.
- Price-basis `UNCONFIRMED` warning and no pack-size multiplication.
- Invalid scheme configurations and ambiguous multiple schemes.
- Stable cart totals and line ordering.

### Integration tests

Cover:

- A retailer gets exactly one cart.
- Product/line uniqueness under repeated adds and concurrent-safe upserts.
- Cart ownership prevents cross-retailer reads and writes.
- Inactive product rejection and inactive-line review behavior.
- Current price/scheme/stock re-read on every calculation.
- Clear, remove, update, and confirmation transaction boundaries.
- Confirmation invalidation after product, scheme, or stock changes.
- No order or inventory mutation during M3 confirmation.

### Playwright E2E tests

Reuse cached M1 sessions and avoid unnecessary OTP requests:

1. Retailer adds biscuit and detergent from the catalogue.
2. Cart persists after reload.
3. Quantity updates recalculate free units and threshold discount.
4. Removing a line and clearing the cart work.
5. Tea with zero stock is visibly unavailable for confirmation.
6. Insufficient stock blocks confirmation without mutating inventory.
7. Price-basis warning and provisional totals are visible.
8. Retailer cannot access another retailer's cart.
9. ORDER_DESK receives forbidden behavior for cart access.
10. Inactive product cannot be added.
11. Product/scheme/stock changes invalidate a previously confirmed cart.
12. Confirming the cart changes only cart state; no order exists and inventory
    remains unchanged.

## Architectural review decisions

1. **Cart line data:** product ID and paid quantity only; no price snapshot.
2. **Inactive products:** keep lines visible as unavailable so the retailer can
   remove them; block confirmation.
3. **Scheme changes:** re-read current schemes; invalidate confirmation and
   recalculate, never preserve stale benefits.
4. **Confirmed-cart staleness:** persist `confirmedFingerprint`, compare it
   with current canonical data, and reopen the cart while clearing both
   confirmation fields when relevant data changes.
5. **M4 reuse:** the pure calculation engine is dependency-free and reusable
   by order submission, but M4 must still perform an atomic stock transaction.
6. **Transactions:** all cart mutations and confirmation state transitions are
   transactions; reads are ownership-scoped.
7. **Unresolved assumptions:** price basis remains unconfirmed; provisional
   totals are allowed only with an explicit warning. Thresholds use paid units,
   free units consume stock, inventory and selling units must match, and no
   commercial tax/payment meaning is inferred.

## M4 handoff requirements

M4 must receive:

- A retailer-owned cart with stable line/product identities.
- A confirmed state that is still revalidated against current product, scheme,
  price, unit, and stock values.
- A persisted confirmation fingerprint that is cleared whenever the cart is
  mutated or becomes stale.
- The dependency-free calculation output in integer paise.
- Paid and free quantities separately, with required stock explicitly exposed.
- A fresh atomic all-or-nothing stock check in the same transaction that creates
  the order.
- A decision on how `PriceBasis.UNCONFIRMED` is resolved before commercial
  order totals are finalized.

M4 must not trust M3 confirmation as inventory reservation or as a permanent
price snapshot.

## Explicit M3 exclusions

- Order creation or submission.
- Inventory reservation or decrement.
- Order-desk approval/rejection.
- Tally CSV export.
- AI text, photo, or voice order capture.
- Payments, GST, tax, and delivery tracking.
- Scheme or product administration.
- Generic promotion engines or scheme stacking.

## Unresolved assumptions and risks

- The distributor has not confirmed whether each supplied price is per PACK or
  per CASE; M3 totals are provisional.
- The requirement does not specify whether a confirmed cart should be editable
  in place or versioned. This plan reopens it on mutation and retains one cart.
- The current schema has no database-level partial unique index for “one active
  cart”; the single unique cart-per-retailer design is the safer minimal
  equivalent.
- Product inventory is represented in `Product.inventoryQty`; M3 reads it but
  cannot guarantee it remains unchanged until M4 submission.
- M3 assumes inventory and selling units are identical for calculable products;
  unit conversion rules are intentionally deferred.
- The current M2 database constraints validate scheme field shapes but do not
  encode that a scheme’s quantities equal the product’s `sellingUnit`; the
  engine receives the product selling unit and treats scheme quantities in that
  unit.
- Concurrent cart mutations may encounter unique conflicts; actions must
  return a safe conflict result or retry within bounded limits.
- No business rule currently defines cart expiry; M3 retains carts until
  cleared, submitted in M4, or explicitly changed by the retailer.
