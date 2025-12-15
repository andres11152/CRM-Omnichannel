/*
 Warnings:
 
 - You are about to drop the column `stage` on the `deals` table. All the data in the column will be lost.
 - Added the required column `pipelineId` to the `deals` table without a default value. This is not possible if the table is not empty.
 - Added the required column `stageId` to the `deals` table without a default value. This is not possible if the table is not empty.
 
 */
-- Step 1: Drop indexes that will be recreated
DROP INDEX IF EXISTS "deals_companyId_idx";
DROP INDEX IF EXISTS "deals_stage_idx";
-- Step 2: Create new tables BEFORE modifying deals
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "stages" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "color" TEXT DEFAULT '#6B7280',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);
-- Step 3: Add foreign keys for pipelines
ALTER TABLE "pipelines"
ADD CONSTRAINT "pipelines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stages"
ADD CONSTRAINT "stages_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Step 4: Create indexes for pipelines and stages
CREATE INDEX "pipelines_companyId_isDefault_idx" ON "pipelines"("companyId", "isDefault");
CREATE UNIQUE INDEX "pipelines_companyId_isDefault_key" ON "pipelines"("companyId", "isDefault");
CREATE INDEX "stages_pipelineId_order_idx" ON "stages"("pipelineId", "order");
CREATE UNIQUE INDEX "stages_pipelineId_order_key" ON "stages"("pipelineId", "order");
-- Step 5: Create default pipeline and stages for each existing company
DO $$
DECLARE company_record RECORD;
pipeline_id TEXT;
BEGIN -- For each company, create default pipeline and stages
FOR company_record IN
SELECT id
FROM companies LOOP -- Generate pipeline ID
    pipeline_id := CONCAT('cluid_pipeline_', company_record.id);
-- Insert pipeline
INSERT INTO pipelines (
        id,
        "companyId",
        name,
        "isDefault",
        "createdAt",
        "updatedAt"
    )
VALUES (
        pipeline_id,
        company_record.id,
        'Pipeline de Ventas',
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
-- Insert stages for this pipeline
INSERT INTO stages (
        id,
        "pipelineId",
        name,
        "order",
        color,
        "createdAt",
        "updatedAt"
    )
VALUES (
        CONCAT('stage_new_', company_record.id),
        pipeline_id,
        'Nuevo',
        0,
        '#3B82F6',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        CONCAT('stage_qualified_', company_record.id),
        pipeline_id,
        'Calificado',
        1,
        '#8B5CF6',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        CONCAT('stage_proposal_', company_record.id),
        pipeline_id,
        'Propuesta',
        2,
        '#F59E0B',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        CONCAT('stage_negotiation_', company_record.id),
        pipeline_id,
        'Negociación',
        3,
        '#EC4899',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        CONCAT('stage_won_', company_record.id),
        pipeline_id,
        'Ganado',
        4,
        '#10B981',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        CONCAT('stage_lost_', company_record.id),
        pipeline_id,
        'Perdido',
        5,
        '#EF4444',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
END LOOP;
END $$;
-- Step 6: Add new columns to deals table with nullable first
ALTER TABLE "deals"
ADD COLUMN "pipelineId" TEXT,
    ADD COLUMN "stageId" TEXT,
    ADD COLUMN "order" DOUBLE PRECISION NOT NULL DEFAULT 0;
-- Step 7: Migrate existing deals to new structure
UPDATE "deals" d
SET "pipelineId" = p.id,
    "stageId" = CASE
        d.stage
        WHEN 'NEW' THEN CONCAT('stage_new_', d."companyId")
        WHEN 'QUALIFIED' THEN CONCAT('stage_qualified_', d."companyId")
        WHEN 'PROPOSAL' THEN CONCAT('stage_proposal_', d."companyId")
        WHEN 'NEGOTIATION' THEN CONCAT('stage_negotiation_', d."companyId")
        WHEN 'WON' THEN CONCAT('stage_won_', d."companyId")
        WHEN 'LOST' THEN CONCAT('stage_lost_', d."companyId")
        ELSE CONCAT('stage_new_', d."companyId")
    END
FROM pipelines p
WHERE p."companyId" = d."companyId"
    AND p."isDefault" = true;
-- Step 8: Make columns NOT NULL after data migration
ALTER TABLE "deals"
ALTER COLUMN "pipelineId"
SET NOT NULL;
ALTER TABLE "deals"
ALTER COLUMN "stageId"
SET NOT NULL;
-- Step 9: Add foreign keys for deals
ALTER TABLE "deals"
ADD CONSTRAINT "deals_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals"
ADD CONSTRAINT "deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Step 10: Drop old stage column and enum
ALTER TABLE "deals" DROP COLUMN IF EXISTS "stage";
DROP TYPE IF EXISTS "DealStage";
-- Step 11: Create new indexes for deals
CREATE INDEX "deals_companyId_pipelineId_stageId_idx" ON "deals"("companyId", "pipelineId", "stageId");
CREATE INDEX "deals_stageId_order_idx" ON "deals"("stageId", "order");
CREATE INDEX "deals_assignedToId_stageId_idx" ON "deals"("assignedToId", "stageId");
-- Step 12: Other table alterations
ALTER TABLE "activities"
ADD COLUMN IF NOT EXISTS "googleEventId" TEXT;
ALTER TABLE "contacts"
ADD COLUMN IF NOT EXISTS "about" TEXT,
    ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;
ALTER TABLE "messages"
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'SENT';
ALTER TABLE "tickets"
ADD COLUMN IF NOT EXISTS "ticketNumber" INTEGER;
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "about" TEXT,
    ADD COLUMN IF NOT EXISTS "googleCalendarRefreshToken" TEXT,
    ADD COLUMN IF NOT EXISTS "googleCalendarToken" TEXT,
    ADD COLUMN IF NOT EXISTS "phone" TEXT,
    ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;
ALTER TABLE "whatsapp_sessions"
ADD COLUMN IF NOT EXISTS "defaultQueueId" TEXT;
-- Step 13: Activity Participants table
CREATE TABLE IF NOT EXISTS "_ActivityParticipants" ("A" TEXT NOT NULL, "B" TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "_ActivityParticipants_AB_unique" ON "_ActivityParticipants"("A", "B");
CREATE INDEX IF NOT EXISTS "_ActivityParticipants_B_index" ON "_ActivityParticipants"("B");
-- Step 14: Add remaining foreign keys
ALTER TABLE "whatsapp_sessions"
ADD CONSTRAINT "whatsapp_sessions_defaultQueueId_fkey" FOREIGN KEY ("defaultQueueId") REFERENCES "queues"("id") ON DELETE
SET NULL ON UPDATE CASCADE;
ALTER TABLE "_ActivityParticipants"
ADD CONSTRAINT "_ActivityParticipants_A_fkey" FOREIGN KEY ("A") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ActivityParticipants"
ADD CONSTRAINT "_ActivityParticipants_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;