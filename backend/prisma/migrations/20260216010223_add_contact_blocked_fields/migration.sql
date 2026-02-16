/*
  Warnings:

  - You are about to drop the `flows` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `companyId` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "contact_flow_sessions" DROP CONSTRAINT "contact_flow_sessions_flowId_fkey";

-- DropForeignKey
ALTER TABLE "flows" DROP CONSTRAINT "flows_companyId_fkey";

-- DropForeignKey
ALTER TABLE "flows" DROP CONSTRAINT "flows_createdById_fkey";

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastManualIntervention" TIMESTAMP(3),
ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ALTER COLUMN "currency" SET DEFAULT 'COP';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeen" TIMESTAMP(3);

-- DropTable
DROP TABLE "flows";

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "socketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_transactions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "invoiceId" TEXT,
    "stripePaymentId" TEXT,
    "billingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_sessions_userId_connectedAt_idx" ON "agent_sessions"("userId", "connectedAt");

-- CreateIndex
CREATE INDEX "agent_sessions_companyId_connectedAt_idx" ON "agent_sessions"("companyId", "connectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_transactions_invoiceId_key" ON "billing_transactions"("invoiceId");

-- CreateIndex
CREATE INDEX "billing_transactions_status_billingDate_idx" ON "billing_transactions"("status", "billingDate" DESC);

-- CreateIndex
CREATE INDEX "billing_transactions_companyId_billingDate_idx" ON "billing_transactions"("companyId", "billingDate" DESC);

-- CreateIndex
CREATE INDEX "contacts_companyId_phone_isBlocked_idx" ON "contacts"("companyId", "phone", "isBlocked");

-- CreateIndex
CREATE INDEX "notifications_companyId_createdAt_idx" ON "notifications"("companyId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_flow_sessions" ADD CONSTRAINT "contact_flow_sessions_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
