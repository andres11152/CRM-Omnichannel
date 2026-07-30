import { prisma, ExtendedPrismaClient } from "@/config/database";

export interface OpenDealSignalsRow {
  dealId: string;
  title: string;
  value: number;
  probability: number;
  stageId: string;
  stageName: string;
  expectedCloseDate: Date | null;
  assignedToId: string | null;
  assignedToName: string | null;
  stageEnteredAt: Date;
  lastActivityAt: Date | null;
  overdueTaskCount: number;
}

export class DealRiskRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  /**
   * Everything the risk-scoring heuristic needs for every open deal, in a
   * single query — per-deal N+1 lookups would be too slow once a company
   * has hundreds of open deals.
   */
  async getOpenDealSignals(companyId: string): Promise<OpenDealSignalsRow[]> {
    return this.db.$queryRaw<OpenDealSignalsRow[]>`
      SELECT
        d.id AS "dealId",
        d.title AS "title",
        d.value AS "value",
        d.probability AS "probability",
        d."stageId" AS "stageId",
        s.name AS "stageName",
        d."expectedCloseDate" AS "expectedCloseDate",
        d."assignedToId" AS "assignedToId",
        u.name AS "assignedToName",
        COALESCE(latest_stage_entry."changedAt", d."updatedAt") AS "stageEnteredAt",
        last_activity."lastActivityAt" AS "lastActivityAt",
        COALESCE(overdue."overdueCount", 0)::int AS "overdueTaskCount"
      FROM deals d
      INNER JOIN stages s ON s.id = d."stageId"
      LEFT JOIN users u ON u.id = d."assignedToId"
      LEFT JOIN LATERAL (
        SELECT dsh."changedAt"
        FROM deal_stage_history dsh
        WHERE dsh."dealId" = d.id AND dsh."toStageId" = d."stageId"
        ORDER BY dsh."changedAt" DESC
        LIMIT 1
      ) latest_stage_entry ON true
      LEFT JOIN LATERAL (
        SELECT MAX(a."createdAt") AS "lastActivityAt"
        FROM activities a
        WHERE a."dealId" = d.id
      ) last_activity ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS "overdueCount"
        FROM activities a
        WHERE a."dealId" = d.id
          AND a.type = 'TASK'
          AND a.status = 'PENDING'
          AND a."dueDate" IS NOT NULL
          AND a."dueDate" < NOW()
      ) overdue ON true
      WHERE d."companyId" = ${companyId}
        AND s."isWon" = false
        AND s."isLost" = false
        AND d."deletedAt" IS NULL
    `;
  }
}

export const dealRiskRepository = new DealRiskRepository();
