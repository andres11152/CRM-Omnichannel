/*
  Warnings:

  - A unique constraint covering the columns `[companyId,phone]` on the table `contacts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPERVISOR';

-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_contactId_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxConcurrency" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "skills" TEXT[];

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ActivityMentions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_companyId_entity_entityId_idx" ON "audit_logs"("companyId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "_ActivityMentions_AB_unique" ON "_ActivityMentions"("A", "B");

-- CreateIndex
CREATE INDEX "_ActivityMentions_B_index" ON "_ActivityMentions"("B");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_companyId_phone_key" ON "contacts"("companyId", "phone");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActivityMentions" ADD CONSTRAINT "_ActivityMentions_A_fkey" FOREIGN KEY ("A") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActivityMentions" ADD CONSTRAINT "_ActivityMentions_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
