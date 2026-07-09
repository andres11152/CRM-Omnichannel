-- DropIndex
DROP INDEX "conversations_companyId_channelId_key";

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "instagramUserId" TEXT,
ADD COLUMN     "instagramUsername" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'WHATSAPP';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "instagramMessageId" TEXT;

-- CreateTable
CREATE TABLE "instagram_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "igBusinessAccountId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "username" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "defaultQueueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_sessions_igBusinessAccountId_key" ON "instagram_sessions"("igBusinessAccountId");

-- CreateIndex
CREATE INDEX "instagram_sessions_companyId_status_idx" ON "instagram_sessions"("companyId", "status");

-- CreateIndex
CREATE INDEX "contacts_companyId_instagramUserId_idx" ON "contacts"("companyId", "instagramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_companyId_instagramUserId_key" ON "contacts"("companyId", "instagramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_companyId_channelId_channel_key" ON "conversations"("companyId", "channelId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "messages_companyId_instagramMessageId_key" ON "messages"("companyId", "instagramMessageId");

-- AddForeignKey
ALTER TABLE "instagram_sessions" ADD CONSTRAINT "instagram_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_sessions" ADD CONSTRAINT "instagram_sessions_defaultQueueId_fkey" FOREIGN KEY ("defaultQueueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

