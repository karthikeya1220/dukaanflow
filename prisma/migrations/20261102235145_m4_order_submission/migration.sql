-- Verify the one-ACTIVE-cart invariant before removing M3's global retailer
-- uniqueness. Do not silently choose a cart if invalid data is present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Cart"
    WHERE "status" = 'ACTIVE'
    GROUP BY "retailerId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate carts: duplicate ACTIVE carts exist per retailer';
  END IF;
END
$$;

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "CartStatus" ADD VALUE 'SUBMITTED';

-- DropIndex
DROP INDEX "Cart_retailerId_key";

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "inventoryReleasedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "subtotalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "priceBasisConfirmed" BOOLEAN NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "paidQty" INTEGER NOT NULL,
    "freeQty" INTEGER NOT NULL,
    "reservedQty" INTEGER NOT NULL,
    "sellingUnit" "ProductUnit" NOT NULL,
    "inventoryUnit" "ProductUnit" NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "priceBasis" "PriceBasis" NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "schemeKind" "SchemeKind",
    "schemeId" TEXT,
    "schemeBuyQty" INTEGER,
    "schemeFreeQty" INTEGER,
    "schemeMinQty" INTEGER,
    "schemeDiscountBps" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cart_retailerId_idx" ON "Cart"("retailerId");
CREATE UNIQUE INDEX "Cart_one_active_per_retailer"
ON "Cart" ("retailerId")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "Order_cartId_key" ON "Order"("cartId");
CREATE INDEX "Order_retailerId_submittedAt_idx" ON "Order"("retailerId", "submittedAt");
CREATE INDEX "Order_status_reservationExpiresAt_idx" ON "Order"("status", "reservationExpiresAt");
CREATE UNIQUE INDEX "Order_retailerId_idempotencyKey_key"
ON "Order"("retailerId", "idempotencyKey");
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- AddForeignKey
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
