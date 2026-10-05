-- AlterTable
ALTER TABLE "Order" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "Order" DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "Order_sessionId_idx" ON "Order"("sessionId");
