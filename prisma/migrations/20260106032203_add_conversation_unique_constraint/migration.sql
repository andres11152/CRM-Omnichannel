/*
  Warnings:

  - A unique constraint covering the columns `[companyId,channelId]` on the table `conversations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "conversations_companyId_channelId_key" ON "conversations"("companyId", "channelId");
