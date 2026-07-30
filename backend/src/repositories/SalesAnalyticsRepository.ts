import { prisma, ExtendedPrismaClient } from "@/config/database";

export interface StageVelocityQueryResult {
  stageId: string;
  stageName: string;
  transitions: number;
  avgDays: number;
}

export interface StageConversionQueryResult {
  stageId: string;
  stageName: string;
  dealsEntered: bigint;
  dealsWon: bigint;
}

export class SalesAnalyticsRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  /**
   * Open (not won/not lost) deals expected to close within the period —
   * the raw material for a weighted forecast.
   */
  async getOpenDealsForForecast(companyId: string, start: Date, end: Date) {
    return this.db.deal.findMany({
      where: {
        companyId,
        expectedCloseDate: { gte: start, lte: end },
        stage: { isWon: false, isLost: false },
      },
      select: { id: true, value: true, probability: true },
    });
  }

  /**
   * Deals closed (won or lost) within the period, with enough detail to
   * compute conversion rate, lost-reason breakdown, and the rep leaderboard.
   */
  async getClosedDealsInRange(companyId: string, start: Date, end: Date) {
    return this.db.deal.findMany({
      where: {
        companyId,
        closedAt: { gte: start, lte: end },
        stage: { OR: [{ isWon: true }, { isLost: true }] },
      },
      select: {
        id: true,
        value: true,
        lostReason: true,
        closedAt: true,
        stage: { select: { isWon: true, isLost: true } },
        assignedToId: true,
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Average days spent in each stage, computed from the append-only
   * DealStageHistory log: for every "entered stage X" event, the duration
   * until the deal's NEXT stage change (or now, if it's still there).
   */
  async getStageVelocity(
    companyId: string,
  ): Promise<StageVelocityQueryResult[]> {
    return this.db.$queryRaw<StageVelocityQueryResult[]>`
      WITH ordered AS (
        SELECT
          dsh."toStageId",
          dsh."changedAt",
          LEAD(dsh."changedAt") OVER (
            PARTITION BY dsh."dealId" ORDER BY dsh."changedAt"
          ) AS "nextChangedAt"
        FROM deal_stage_history dsh
        WHERE dsh."companyId" = ${companyId}
          AND dsh."toStageId" IS NOT NULL
      )
      SELECT
        o."toStageId" AS "stageId",
        s.name AS "stageName",
        COUNT(*)::int AS "transitions",
        AVG(
          EXTRACT(EPOCH FROM (COALESCE(o."nextChangedAt", NOW()) - o."changedAt")) / 86400
        )::float AS "avgDays"
      FROM ordered o
      INNER JOIN stages s ON s.id = o."toStageId"
      GROUP BY o."toStageId", s.name
      ORDER BY "avgDays" DESC
    `;
  }

  /**
   * For each stage, how many deals ever passed through it (per the history
   * log) versus how many of those deals eventually landed in a "won" stage.
   */
  async getStageConversion(
    companyId: string,
  ): Promise<StageConversionQueryResult[]> {
    return this.db.$queryRaw<StageConversionQueryResult[]>`
      SELECT
        s.id AS "stageId",
        s.name AS "stageName",
        COUNT(DISTINCT dsh."dealId") AS "dealsEntered",
        COUNT(DISTINCT CASE WHEN finalStage."isWon" THEN dsh."dealId" END) AS "dealsWon"
      FROM deal_stage_history dsh
      INNER JOIN stages s ON s.id = dsh."toStageId"
      INNER JOIN deals d ON d.id = dsh."dealId"
      INNER JOIN stages finalStage ON finalStage.id = d."stageId"
      WHERE dsh."companyId" = ${companyId}
      GROUP BY s.id, s.name
      ORDER BY "dealsEntered" DESC
    `;
  }
}

export const salesAnalyticsRepository = new SalesAnalyticsRepository();
