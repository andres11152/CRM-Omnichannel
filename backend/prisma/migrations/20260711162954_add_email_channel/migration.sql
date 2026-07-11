-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "emailInboundEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "imapHost" TEXT,
ADD COLUMN     "imapLastSeenAt" TIMESTAMP(3),
ADD COLUMN     "imapLastSeenUid" INTEGER,
ADD COLUMN     "imapPassword" TEXT,
ADD COLUMN     "imapPort" INTEGER,
ADD COLUMN     "imapSecure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "imapUser" TEXT;

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "inReplyTo" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "emailMessageId" TEXT;

-- CreateIndex
CREATE INDEX "emails_conversationId_createdAt_idx" ON "emails"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "messages_companyId_emailMessageId_key" ON "messages"("companyId", "emailMessageId");

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
