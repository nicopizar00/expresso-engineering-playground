-- AlterTable
ALTER TABLE "Order" ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_clientRequestId_key" ON "Order"("clientRequestId");
