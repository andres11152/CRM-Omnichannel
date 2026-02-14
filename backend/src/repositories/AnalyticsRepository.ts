import { prisma, ExtendedPrismaClient } from "@/config/database";

export interface AgentPerformanceQueryResult {
  agentId: string;
  name: string;
  email: string;
  role: string;
  totalTickets: number;
  resolvedTickets: number;
  avgResolutionTime: number | null;
}

export interface HeatmapQueryResult {
  day: number;
  hour: number;
  value: bigint;
}

export class AnalyticsRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async getFinancialData() {
    return this.db.company.findMany({
      where: {
        status: { notIn: ["CANCELED", "INACTIVE"] },
        plan: { isNot: null },
      },
      select: {
        plan: { select: { price: true, name: true, id: true } },
      },
    });
  }

  async getCompanyCountByPlan() {
    return this.db.company.groupBy({
      by: ["planId"],
      _count: { planId: true },
      where: { slug: { notIn: ["reply-saas-admin", "crm-saas"] } },
    });
  }

  async getPlans() {
    return this.db.plan.findMany({
      select: { id: true, name: true },
    });
  }

  async getNewCompanies(since: Date) {
    return this.db.company.findMany({
      where: {
        createdAt: { gte: since },
        slug: { notIn: ["reply-saas-admin"] },
      },
      select: { createdAt: true },
    });
  }

  async getHeatmap(
    companyId: string,
    start: Date,
    end: Date,
  ): Promise<HeatmapQueryResult[]> {
    return this.db.$queryRawUnsafe<HeatmapQueryResult[]>(
      `
      SELECT 
        EXTRACT(DOW FROM m."createdAt")::int as day,
        EXTRACT(HOUR FROM m."createdAt")::int as hour,
        COUNT(*)::bigint as value
      FROM messages m
      JOIN conversations c ON m."conversationId" = c.id
      WHERE c."companyId" = $1
        AND m."createdAt" >= $2
        AND m."createdAt" <= $3
      GROUP BY 1, 2
      ORDER BY 1, 2
      `,
      companyId,
      start,
      end,
    );
  }

  async getAgentPerformance(
    companyId: string,
    start: Date,
    end: Date,
  ): Promise<AgentPerformanceQueryResult[]> {
    return this.db.$queryRawUnsafe<AgentPerformanceQueryResult[]>(
      `
      SELECT 
        u.id as "agentId",
        u.name,
        u.email,
        u.role,
        COUNT(t.id)::int as "totalTickets",
        COUNT(CASE WHEN t.status IN ('RESOLVED', 'CLOSED') THEN 1 END)::int as "resolvedTickets",
        AVG(CASE WHEN t."status" IN ('RESOLVED', 'CLOSED') AND t."resolvedAt" IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt"))/60 
        END)::float as "avgResolutionTime"
      FROM users u
      LEFT JOIN tickets t ON u.id = t."assignedToId" AND t."createdAt" >= $2 AND t."createdAt" <= $3
      WHERE u."companyId" = $1
        AND u.role IN ('AGENT', 'ADMIN', 'SUPERVISOR')
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY "resolvedTickets" DESC
      `,
      companyId,
      start,
      end,
    );
  }

  async getConversationsWithTags(companyId: string, start: Date, end: Date) {
    return this.db.conversation.findMany({
      where: { companyId, createdAt: { gte: start, lte: end } },
      select: { tags: true },
    });
  }

  async getTags(companyId: string) {
    return this.db.tag.findMany({
      where: { companyId },
      select: { name: true, color: true },
    });
  }
}

export const analyticsRepository = new AnalyticsRepository();
