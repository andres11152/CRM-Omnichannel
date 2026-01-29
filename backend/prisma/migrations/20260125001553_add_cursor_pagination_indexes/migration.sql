-- CreateIndex
CREATE INDEX "conversations_companyId_updatedAt_id_idx" ON "conversations"("companyId", "updatedAt" DESC, "id" ASC);

-- CreateIndex
CREATE INDEX "conversations_companyId_status_updatedAt_id_idx" ON "conversations"("companyId", "status", "updatedAt" DESC, "id" ASC);

-- CreateIndex
CREATE INDEX "conversations_assignedToId_updatedAt_id_idx" ON "conversations"("assignedToId", "updatedAt" DESC, "id" ASC);

-- CreateIndex
CREATE INDEX "conversations_queueId_updatedAt_id_idx" ON "conversations"("queueId", "updatedAt" DESC, "id" ASC);

-- CreateIndex
CREATE INDEX "conversations_companyId_channelId_idx" ON "conversations"("companyId", "channelId");

-- CreateIndex
CREATE INDEX "conversations_contactId_updatedAt_idx" ON "conversations"("contactId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_id_idx" ON "messages"("conversationId", "createdAt" DESC, "id" ASC);

-- CreateIndex
CREATE INDEX "messages_conversationId_status_createdAt_idx" ON "messages"("conversationId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "messages_channel_createdAt_idx" ON "messages"("channel", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "messages_conversationId_direction_createdAt_idx" ON "messages"("conversationId", "direction", "createdAt" DESC);
