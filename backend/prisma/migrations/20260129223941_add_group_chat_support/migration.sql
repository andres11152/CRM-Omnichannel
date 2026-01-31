/*
  Warnings:

  - You are about to drop the `TestModel` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[whatsappMessageId]` on the table `messages` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `messages` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "contacts_companyId_deletedAt_idx";

-- DropIndex
DROP INDEX "conversations_assignedToId_status_updatedAt_idx";

-- DropIndex
DROP INDEX "conversations_assignedToId_updatedAt_id_idx";

-- DropIndex
DROP INDEX "conversations_companyId_status_updatedAt_id_idx";

-- DropIndex
DROP INDEX "conversations_companyId_updatedAt_idx";

-- DropIndex
DROP INDEX "conversations_contactId_updatedAt_idx";

-- DropIndex
DROP INDEX "conversations_queueId_status_updatedAt_idx";

-- DropIndex
DROP INDEX "conversations_queueId_updatedAt_id_idx";

-- DropIndex
DROP INDEX "messages_channel_createdAt_idx";

-- DropIndex
DROP INDEX "messages_conversationId_createdAt_id_idx";

-- DropIndex
DROP INDEX "messages_conversationId_direction_createdAt_idx";

-- DropIndex
DROP INDEX "messages_conversationId_status_createdAt_idx";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "groupMetadata" JSONB,
ADD COLUMN     "isGroup" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "whatsappMessageId" TEXT;

-- DropTable
DROP TABLE "TestModel";

-- CreateIndex
CREATE INDEX "contacts_companyId_updatedAt_idx" ON "contacts"("companyId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "contacts_companyId_name_idx" ON "contacts"("companyId", "name");

-- CreateIndex
CREATE INDEX "conversations_companyId_assignedToId_status_updatedAt_idx" ON "conversations"("companyId", "assignedToId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "conversations_companyId_queueId_status_updatedAt_idx" ON "conversations"("companyId", "queueId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "messages_whatsappMessageId_key" ON "messages"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "messages_companyId_createdAt_idx" ON "messages"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "messages_companyId_status_createdAt_idx" ON "messages"("companyId", "status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
