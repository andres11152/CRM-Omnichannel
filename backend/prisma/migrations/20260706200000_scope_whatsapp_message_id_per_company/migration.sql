-- DropIndex
DROP INDEX "messages_whatsappMessageId_key";

-- CreateIndex
CREATE UNIQUE INDEX "messages_companyId_whatsappMessageId_key" ON "messages"("companyId", "whatsappMessageId");
