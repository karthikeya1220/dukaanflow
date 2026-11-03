-- AlterTable
ALTER TABLE "Order" ADD COLUMN "isSimulation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "reviewedByUserId" TEXT;

