# M2 — Retailer Catalogue

## Revised scope

M2 is strictly the retailer catalogue milestone. It adds the catalogue data
model, deterministic demo catalogue seed data, and a server-rendered retailer
catalogue with search and basic filtering.

Included:

- Prisma `Product` and `Scheme` models plus a migration.
- Idempotent demo seed data for the three supplied products.
- Product SKU, name, price, pack size, selling unit, inventory quantity, and
  stock display.
- The two supported scheme types:
  - `BUY_X_GET_Y`
  - `THRESHOLD_PERCENT`
- Server-rendered catalogue UI for authenticated retailers.
- Search and basic catalogue filtering.
- Server-side retailer authorization using the existing M1 `requireRole`.
- Focused unit and Playwright E2E tests.

M2 does not implement cart state, order submission, or scheme arithmetic.

## Original product fixture

The original fixture supplies the three catalogue records below. No
description or other missing product metadata is invented.

| Supplied product | SKU | Name | Price basis | Pack size | Selling unit | Inventory quantity/unit | Scheme |
|---|---|---|---|---:|---|---|---|
| Glucose biscuit | `SKU-BS-075` | Glucose biscuit, 75 g | `UNCONFIRMED` | 96 | CASE | 340 CASE | `BUY_X_GET_Y` — buy 10 CASE, get 1 CASE free |
| Detergent powder | `SKU-DT-1KG` | Detergent powder, 1 kg | `UNCONFIRMED` | 20 | CASE | 85 CASE | `THRESHOLD_PERCENT` — minimum 5 CASE, 300 bps |
| Tea leaf | `SKU-TE-250` | Tea leaf, 250 g | `UNCONFIRMED` | 40 | CASE | 0 CASE | None |

For all three products, `packUnit` is `PACK`, `sellingUnit` is `CASE`, and
`inventoryUnit` is `CASE`. Prices are stored as integer paise without
multiplication: 810, 10150, and 11800 respectively. Scheme quantity
parameters are expressed in the selling unit, CASE.

## Proposed Prisma models and relationships

Use the existing Prisma 7 generator, PostgreSQL datasource, and naming style.
Keep the model specific to the two supported scheme types; do not introduce a
generic promotion/rules engine.

```prisma
enum ProductUnit {
  PIECE
  PACK
  CASE
}

enum SchemeKind {
  BUY_X_GET_Y
  THRESHOLD_PERCENT
}

enum PriceBasis {
  UNCONFIRMED
  PER_PACK
  PER_CASE
}

model Product {
  id              String       @id @default(cuid())
  sku             String       @unique
  name            String
  description     String?
  pricePaise      Int
  priceBasis      PriceBasis   @default(UNCONFIRMED)
  packSize        Int
  packUnit        ProductUnit
  sellingUnit     ProductUnit
  inventoryQty    Int
  inventoryUnit   ProductUnit
  isActive        Boolean      @default(true)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  schemes         Scheme[]

  @@index([isActive, name])
}

model Scheme {
  id              String       @id @default(cuid())
  productId       String
  kind            SchemeKind
  buyQty          Int?
  freeQty         Int?
  minQty          Int?
  discountBps     Int?
  isActive        Boolean      @default(true)
  product         Product      @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, isActive])
}
```

Invariants enforced by the M2 seed/application tests and migration checks:

- `pricePaise >= 0`.
- `packSize > 0`.
- `inventoryQty >= 0`.
- `inventoryUnit` is the unit in which `inventoryQty` is counted and displayed.
- `sellingUnit` is the unit a retailer orders; `pricePaise` is the supplied
  price for the recorded price basis and is stored verbatim.
- `packUnit` describes the contents of the selling package; it does not cause
  price multiplication.
- `priceBasis` explicitly records whether the supplied price is per pack or per
  case. `UNCONFIRMED` is valid and is used for all three fixture products until
  the client confirms the basis.
- The fixture's `pricePaise` values are 810, 10150, and 11800. Nothing
  multiplies them by pack size or case quantity.
- `BUY_X_GET_Y` requires positive `buyQty` and `freeQty`, with percentage
  fields null; both quantities are in the product selling unit.
- `THRESHOLD_PERCENT` requires positive `minQty` and a bounded positive
  `discountBps`, with buy/free fields null; `minQty` is in the product selling
  unit.
- An active scheme belongs to an active product to be displayed as an active
  offer.

The migration should use PostgreSQL check constraints for numeric invariants
where practical. Scheme-kind-specific field validation remains explicit in the
seed/service boundary rather than being hidden behind a generic abstraction.

### Price-basis assumption

The client sample does not establish whether dealer prices are per pack or per
case. M2 must preserve this ambiguity: record the supplied price in
`pricePaise` exactly as supplied, set `priceBasis` to `UNCONFIRMED`, display the
selling unit/pack metadata, and never multiply the price by `packSize`. When
the client confirms the basis, update the explicit enum value; do not silently
change the stored price. The unresolved basis remains documented in
`docs/TDD.md`.

## Migration strategy

1. Extend `prisma/schema.prisma` with `ProductUnit`, `SchemeKind`, `PriceBasis`,
   `Product`, and `Scheme`.
2. Create one Prisma migration from the committed M1 schema; do not rewrite
   the M0/M1 migration.
3. Add unique/index constraints for SKU, active catalogue filtering, and
   product-scheme lookup.
4. Add numeric, price-basis, and scheme-shape checks in the migration where
   supported.
5. Preserve `UNCONFIRMED` as a valid price-basis value.
6. Generate the Prisma 7 client using the existing generated-client path.
7. Run the idempotent seed after migration.
8. Verify existing M1 `User` rows and authentication behavior remain unchanged.

No cart, order, reservation, or approval tables belong in this migration.

## Seed strategy and mapping

Extend the existing idempotent `prisma/seed.ts` without changing its
authentication-user provisioning behavior:

- Upsert products by stable SKU.
- Upsert schemes by a stable product/kind identity.
- Update demo values on repeat runs rather than inserting duplicates.
- Validate all three supplied product records before writing them.
- Do not create products or schemes from missing/placeholder values.

The three supplied products map one-to-one as follows:

| SKU | `pricePaise` | `priceBasis` | `packSize` | `packUnit` | `sellingUnit` | `inventoryQty` | `inventoryUnit` | Scheme fields |
|---|---:|---|---:|---|---|---:|---|---|
| `SKU-BS-075` | 810 | `UNCONFIRMED` | 96 | `PACK` | `CASE` | 340 | `CASE` | `BUY_X_GET_Y`, `buyQty=10`, `freeQty=1` |
| `SKU-DT-1KG` | 10150 | `UNCONFIRMED` | 20 | `PACK` | `CASE` | 85 | `CASE` | `THRESHOLD_PERCENT`, `minQty=5`, `discountBps=300` |
| `SKU-TE-250` | 11800 | `UNCONFIRMED` | 40 | `PACK` | `CASE` | 0 | `CASE` | None |

All three supplied products are active. No inactive fixture record is
invented; tests should create inactive records in isolated fixtures to verify
visibility rules. The biscuit and detergent schemes are active; the tea leaf
has no scheme.

## Catalogue page design

Replace the authenticated retailer placeholder with a server-rendered
catalogue page at `/retailer`.

Request flow:

1. Call `requireRole('RETAILER')` before reading catalogue data.
2. Parse search/filter query parameters with Zod.
3. Query only active products.
4. Apply case-insensitive name/SKU search and basic filters such as:
   - in-stock versus out-of-stock;
   - product unit;
   - has active scheme.
5. Load only active schemes belonging to active products.
6. Render stable product cards or a table with:
   - product name and SKU;
   - price in rupees formatted from integer paise;
   - explicit price basis, selling unit, and pack-size text;
   - live inventory quantity and inventory unit;
   - active scheme summary.

The page is read-only in M2. There is no add-to-cart control, quantity
mutation, reservation, or order submission. The order-desk role remains
forbidden from `/retailer` through the existing server-side guard.

## Test plan

### Unit tests

Add focused tests for:

- active products are eligible for catalogue queries;
- inactive products are excluded;
- inactive schemes are excluded from active offer display;
- SKU/name search matching and empty-result behavior;
- stock and inventory-unit formatting;
- pack-size and selling-unit display;
- price basis displays `UNCONFIRMED` for all fixture products;
- supplied prices display as ₹8.10, ₹101.50, and ₹118.00 and are never
  multiplied by pack size;
- fixture mappings use 340, 85, and 0 CASE inventory quantities;
- scheme quantities are interpreted in CASE selling units;
- scheme records accept only `BUY_X_GET_Y` and `THRESHOLD_PERCENT`;
- invalid scheme field combinations are rejected;
- seed upserts are idempotent at the data-contract level.

Do not test cart totals or scheme discounts in M2; those belong to M3.

### E2E tests

Using the existing M1 authentication helpers and cached sessions:

1. Retailer login reaches `/retailer` and sees all active supplied products.
2. Catalogue displays SKU, price, pack size, selling unit, stock quantity/unit,
   and active scheme text.
3. Search by product name and SKU narrows results.
4. Basic stock/scheme filters behave correctly.
5. Inactive products and schemes are not displayed as active offers.
6. Order-desk users receive forbidden behavior for `/retailer`.
7. Unauthenticated access remains redirected to `/login`.
8. Existing M1 login, logout, PKCE, and role-isolation tests continue to pass.

Tests must use the deterministic seeded fixture and must not send unnecessary
real OTP requests.

## Explicit M2 exclusions

Moved to M3:

- Cart persistence.
- Cart server actions.
- Quantity updates and line removal.
- Pure scheme calculation engine.
- Discount calculations.
- Buy-X-get-Y free-unit calculations.

Reserved for M4:

- Stock reservation.
- Order submission.
- Transactional all-or-nothing inventory decrement.
- Order lifecycle persistence.

Also excluded from M2:

- Order-desk approval/rejection.
- Tally CSV export.
- AI text-order capture or product mapping.
- Scheme administration UI.
- Product administration UI.
- Payments, tax/GST, notifications, and multi-tenant support.
- Generic promotion-engine abstractions or scheme stacking.

## M2 quality gates

Before M2 completion:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Also verify the migration and idempotent seed against the local Supabase
PostgreSQL stack, inspect the complete diff, and confirm no M1 behavior or
credentials are changed.
