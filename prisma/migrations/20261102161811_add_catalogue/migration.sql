-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('PIECE', 'PACK', 'CASE');

-- CreateEnum
CREATE TYPE "PriceBasis" AS ENUM ('UNCONFIRMED', 'PER_PACK', 'PER_CASE');

-- CreateEnum
CREATE TYPE "SchemeKind" AS ENUM ('BUY_X_GET_Y', 'THRESHOLD_PERCENT');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "priceBasis" "PriceBasis" NOT NULL DEFAULT 'UNCONFIRMED',
    "packSize" INTEGER NOT NULL,
    "packUnit" "ProductUnit" NOT NULL,
    "sellingUnit" "ProductUnit" NOT NULL,
    "inventoryQty" INTEGER NOT NULL,
    "inventoryUnit" "ProductUnit" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scheme" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "SchemeKind" NOT NULL,
    "buyQty" INTEGER,
    "freeQty" INTEGER,
    "minQty" INTEGER,
    "discountBps" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Scheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_isActive_name_idx" ON "Product"("isActive", "name");

-- CreateIndex
CREATE INDEX "Scheme_productId_isActive_idx" ON "Scheme"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Scheme_productId_kind_key" ON "Scheme"("productId", "kind");

-- AddForeignKey
ALTER TABLE "Scheme" ADD CONSTRAINT "Scheme_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
