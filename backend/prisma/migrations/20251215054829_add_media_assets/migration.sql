/*
  Warnings:

  - Made the column `ticketNumber` on table `tickets` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "FlowTriggerType" AS ENUM ('KEYWORD', 'NEW_CONTACT', 'DEAL_STAGE', 'TIME_DELAY', 'MANUAL');

-- CreateEnum
CREATE TYPE "FlowNodeType" AS ENUM ('START', 'SEND_MESSAGE', 'SEND_IMAGE', 'SEND_VIDEO', 'SEND_AUDIO', 'SEND_DOCUMENT', 'ASK_DATA', 'CONDITION', 'AI_AGENT', 'CREATE_DEAL', 'UPDATE_CONTACT', 'ASSIGN_AGENT', 'AI_HANDOFF', 'DELAY', 'END');

-- CreateEnum
CREATE TYPE "FlowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaAssetType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT');

-- AlterTable
ALTER TABLE "tickets" ALTER COLUMN "ticketNumber" SET NOT NULL;

-- CreateTable
CREATE TABLE "flows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FlowStatus" NOT NULL DEFAULT 'DRAFT',
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "triggerType" "FlowTriggerType" NOT NULL,
    "triggerData" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_flow_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "conversationId" TEXT,
    "currentNodeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "visitedNodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "lastStepAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_flow_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "type" "MediaAssetType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "cloudinaryPublicId" TEXT,
    "category" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flows_companyId_isActive_idx" ON "flows"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "flows_triggerType_idx" ON "flows"("triggerType");

-- CreateIndex
CREATE INDEX "contact_flow_sessions_companyId_isActive_idx" ON "contact_flow_sessions"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "contact_flow_sessions_flowId_isActive_idx" ON "contact_flow_sessions"("flowId", "isActive");

-- CreateIndex
CREATE INDEX "contact_flow_sessions_contactId_isActive_idx" ON "contact_flow_sessions"("contactId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "contact_flow_sessions_contactId_flowId_isActive_key" ON "contact_flow_sessions"("contactId", "flowId", "isActive");

-- CreateIndex
CREATE INDEX "media_assets_companyId_type_idx" ON "media_assets"("companyId", "type");

-- CreateIndex
CREATE INDEX "media_assets_companyId_category_idx" ON "media_assets"("companyId", "category");

-- CreateIndex
CREATE INDEX "media_assets_uploadedById_idx" ON "media_assets"("uploadedById");

-- AddForeignKey
ALTER TABLE "flows" ADD CONSTRAINT "flows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flows" ADD CONSTRAINT "flows_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_flow_sessions" ADD CONSTRAINT "contact_flow_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_flow_sessions" ADD CONSTRAINT "contact_flow_sessions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_flow_sessions" ADD CONSTRAINT "contact_flow_sessions_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_flow_sessions" ADD CONSTRAINT "contact_flow_sessions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
