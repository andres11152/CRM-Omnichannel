import { prisma, ExtendedPrismaClient } from "@/config/database";

export class DashboardRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async getRecentTickets(companyId: string, take: number) {
    return this.db.ticket.findMany({
      where: { companyId, deletedAt: null, conversation: { isNot: null, isGroup: false } },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    });
  }

  async getRecentUsers(companyId: string, take: number) {
    return this.db.user.findMany({
      where: { companyId, role: { in: ["AGENT", "ADMIN"] } },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, name: true, createdAt: true },
    });
  }

  async getCompanyWithPlan(companyId: string) {
    return this.db.company.findUnique({
      where: { id: companyId },
      include: { plan: true },
    });
  }

  async countActiveTickets(companyId: string) {
    return this.db.ticket.count({
      where: {
        companyId,
        status: { notIn: ["RESOLVED", "CLOSED"] },
        deletedAt: null,
        conversation: { isNot: null, isGroup: false },
      },
    });
  }

  async countTodayMessages(companyId: string, today: Date) {
    return this.db.message.count({
      where: { conversation: { companyId }, createdAt: { gte: today } },
    });
  }

  async countActiveConversations(companyId: string, since: Date) {
    return this.db.conversation.count({
      where: { companyId, updatedAt: { gte: since } },
    });
  }

  async getMessageCountByChannel(companyId: string) {
    return this.db.message.groupBy({
      by: ["channel"],
      where: { conversation: { companyId } },
      _count: { id: true },
    });
  }

  async getDefaultPipeline(companyId: string) {
    return this.db.pipeline.findFirst({
      where: { companyId, isDefault: true },
      include: { stages: { orderBy: { order: "asc" } } },
    });
  }

  async getAgentsWithDealAndConvoStats(companyId: string, take: number) {
    return this.db.user.findMany({
      where: { companyId, role: { in: ["AGENT", "ADMIN"] } },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            assignedDeals: { where: { stage: { name: "Ganado" } } },
            assignedConversations: { where: { status: "RESOLVED" } },
          },
        },
      },
      take,
    });
  }

  async getAgentsWithWorkloadStats(companyId: string) {
    return this.db.user.findMany({
      where: { companyId, role: { in: ["AGENT", "ADMIN"] } },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            assignedTickets: {
              where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
            },
            assignedConversations: { where: { status: "IN_PROGRESS" } },
          },
        },
      },
    });
  }

  async countResolvedTickets(companyId: string, since: Date, onlyAI: boolean) {
    return this.db.ticket.count({
      where: {
        companyId,
        status: { in: ["RESOLVED", "CLOSED"] },
        updatedAt: { gte: since },
        ...(onlyAI ? { assignedToId: null } : {}),
      },
    });
  }

  async getRecentMessagesForSpeed(
    companyId: string,
    since: Date,
    take: number,
  ) {
    return this.db.message.findMany({
      where: {
        conversation: { companyId },
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
        direction: true,
        conversationId: true,
      },
      orderBy: { createdAt: "asc" },
      take,
    });
  }

  async getDealsByStage(pipelineId: string) {
    return this.db.deal.groupBy({
      by: ["stageId"],
      where: { pipelineId },
      _count: { id: true },
      _sum: { value: true },
    });
  }

  async getTopAgentsForMonthlyActivity(
    companyId: string,
    startOfMonth: Date,
    take: number,
  ) {
    return this.db.user.findMany({
      where: { companyId, role: { in: ["AGENT", "ADMIN"] } },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            createdActivities: {
              where: {
                createdAt: { gte: startOfMonth },
                status: "COMPLETED",
              },
            },
            assignedDeals: { where: { stage: { name: "Ganado" } } },
          },
        },
      },
      take,
    });
  }

  async getAllDealsForSales(companyId: string) {
    return this.db.deal.findMany({
      where: { companyId },
      select: {
        value: true,
        probability: true,
        updatedAt: true,
        stage: { select: { name: true } },
      },
    });
  }

  async getOverviewStats(companyId: string, today: Date) {
    return Promise.all([
      this.db.contact.count({ where: { companyId } }),
      this.db.campaign.count({
        where: { companyId, status: { in: ["sending", "scheduled"] } },
      }),
      this.db.message.count({
        where: { conversation: { companyId }, createdAt: { gte: today } },
      }),
    ]);
  }

  async getRecentCampaignsAndContacts(companyId: string, take: number) {
    return Promise.all([
      this.db.campaign.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take,
      }),
      this.db.contact.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take,
      }),
    ]);
  }
  async getAgentStats(companyId: string, agentId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Promise.all([
      // 1. Active Tickets (Assigned & Open)
      this.db.ticket.count({
        where: {
          companyId,
          assignedToId: agentId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),

      // 2. Resolved Today
      this.db.ticket.count({
        where: {
          companyId,
          assignedToId: agentId,
          status: { in: ["RESOLVED", "CLOSED"] },
          updatedAt: { gte: today },
        },
      }),

      // 3. Messages Sent Today (Activity)
      this.db.message.count({
        where: {
          conversation: {
            companyId,
            assignedToId: agentId,
          },
          direction: "OUTBOUND",
          createdAt: { gte: today },
        },
      }),

      // 4. Recent Tickets
      this.db.ticket.findMany({
        where: {
          companyId,
          assignedToId: agentId,
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          updatedAt: true,
          queue: {
            select: { name: true },
          },
        },
      }),
    ]);
  }
}

export const dashboardRepository = new DashboardRepository();
