-- Sincroniza el drift entre el migration history y el schema real.
-- Estas estructuras ya existían en Render (aplicadas vía `prisma db push` sin
-- migración), por eso TODO es idempotente (IF NOT EXISTS / guardas): en local
-- las crea, en Render corre como no-op y queda registrada como aplicada.

-- DropIndex
DROP INDEX IF EXISTS "contacts_companyId_updatedAt_idx";

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "scopes" TEXT[] DEFAULT ARRAY['*']::TEXT[];

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "syncEnabled" SET DEFAULT false;

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "isGlobal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "whatsapp_sessions" ADD COLUMN IF NOT EXISTS "proxyUrl" TEXT;

-- AlterTable
ALTER TABLE "workflow_executions" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "isGlobal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "api_access_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "webhook_delivery_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "error" TEXT,
    "payload" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "api_access_logs_companyId_createdAt_idx" ON "api_access_logs"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhook_delivery_logs_companyId_createdAt_idx" ON "webhook_delivery_logs"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhook_delivery_logs_webhookId_createdAt_idx" ON "webhook_delivery_logs"("webhookId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contacts_companyId_deletedAt_createdAt_idx" ON "contacts"("companyId", "deletedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhooks_companyId_isActive_idx" ON "webhooks"("companyId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_executions_companyId_startedAt_idx" ON "workflow_executions"("companyId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_executions_workflowId_status_startedAt_idx" ON "workflow_executions"("workflowId", "status", "startedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "workflow_executions_companyId_workflowId_status_startedAt_idx" ON "workflow_executions"("companyId", "workflowId", "status", "startedAt" DESC);

-- AddForeignKey (guarded: el constraint ya existe en Render)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_executions_companyId_fkey') THEN
    ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (guarded)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_delivery_logs_webhookId_fkey') THEN
    ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
