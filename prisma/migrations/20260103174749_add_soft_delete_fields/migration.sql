-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- CreateIndex
CREATE INDEX "campaigns_companyId_deletedAt_idx" ON "campaigns"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "contacts_companyId_deletedAt_idx" ON "contacts"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "contacts_companyId_phone_idx" ON "contacts"("companyId", "phone");

-- CreateIndex
CREATE INDEX "contacts_companyId_email_idx" ON "contacts"("companyId", "email");

-- CreateIndex
CREATE INDEX "deals_companyId_deletedAt_idx" ON "deals"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "tickets_companyId_deletedAt_idx" ON "tickets"("companyId", "deletedAt");
