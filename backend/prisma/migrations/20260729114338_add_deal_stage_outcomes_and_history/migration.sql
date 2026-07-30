-- AlterTable
ALTER TABLE "stages" ADD COLUMN     "isLost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isWon" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "deal_stage_history" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "valueAtChange" DOUBLE PRECISION NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_stage_history_companyId_changedAt_idx" ON "deal_stage_history"("companyId", "changedAt");

-- CreateIndex
CREATE INDEX "deal_stage_history_dealId_changedAt_idx" ON "deal_stage_history"("dealId", "changedAt");

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: mark existing stages as won/lost based on common naming conventions.
-- New companies get real UI controls to set this explicitly going forward;
-- this only prevents existing pipelines from silently reporting zero.
UPDATE "stages" SET "isWon" = true
WHERE lower("name") IN ('ganado', 'won', 'cerrado-ganado', 'cerrado ganado', 'closed won');

UPDATE "stages" SET "isLost" = true
WHERE lower("name") IN ('perdido', 'lost', 'cerrado-perdido', 'cerrado perdido', 'closed lost');
