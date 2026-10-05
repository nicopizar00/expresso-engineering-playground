-- DropIndex
DROP INDEX "Order_ownerUsername_idx";

-- DropIndex
DROP INDEX "Order_ownerEmail_idx";

-- CreateIndex
CREATE INDEX "Order_ownerUsername_placedAt_idx" ON "Order"("ownerUsername", "placedAt");

-- CreateIndex
CREATE INDEX "Order_ownerEmail_placedAt_idx" ON "Order"("ownerEmail", "placedAt");
