import { prisma } from "@/config/database";
import redisClient from "@/config/redis";
import { planLimitsService } from "@/services/planLimitsService";
import { Logger } from "@/utils/logger";
import { Company, Ticket, User } from "@prisma/client";

// --- DTOs ---

export interface ActivityItem {
  id: string;
  type: "TICKET" | "USER" | "CAMPAIGN" | "CONTACT";
  text: string;
  time: Date;
  icon: string;
  metadata?: any;
}

export interface PlanDataDTO {
  name: string;
  expiresAt?: Date | null;
  status: string;
  isActive: boolean;
  features: { label: string; enabled: boolean; icon: string }[];
  usage: { label: string; used: number; limit: number; unit: string }[];
}

export interface DashboardStatsDTO {
  activities: ActivityItem[];
  plan: PlanDataDTO;
  metrics: {
    activeTickets: number;
    totalMessages: number;
    activeConversations: number;
    aiResolution: string;
    avgResponseTime: string; // "30s" or "5m"
  };
  salesFunnel: { name: string; count: number; value: number; color: string }[];
  topAgents: {
    name: string;
    sales: number;
    score: number;
    responseTime: string;
    avatar: string;
  }[];
  channelDistribution: {
    channel: string;
    name: string;
    count: number;
    percentage: number;
    color: string;
    gradient: string;
    iconClass: string;
  }[];
  agentWorkload: { name: string; pending: number; inProgress: number }[];
}

export interface SalesStatsDTO {
  forecast: number;
  pipelineValue: number;
  wonCount: number;
  wonValue: number;
  conversionRate: number;
  leaderboard: {
    id: string;
    name: string;
    activities: number;
    dealsWon: number;
    avatar: string | null;
  }[];
}

export interface OverviewMetricsDTO {
  totalContacts: number;
  activeCampaigns: number;
  messagesSentToday: number;
  recentActivity: ActivityItem[];
}

// --- SERVICE ---

export class DashboardService {
  private CACHE_TTL = 60;

  /**
   * Main Dashboard Stats
   * Cached in Redis for 60s
   */
  async getDashboardStats(companyId: string): Promise<DashboardStatsDTO> {
    const cacheKey = `dashboard:stats:${companyId}`;

    if (redisClient?.isOpen) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (e) {
        Logger.warn("[DashboardService] Redis read failed", e);
      }
    }

    // 1. Parallel Data Fetching
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Optimized Queries with SELECT
    const [
      recentTickets,
      recentUsers,
      company,
      activeTicketsCount,
      todayMessagesCount,
      activeConversationsCount,
      channelStats,
      defaultPipeline,
      topAgentsRaw,
      agentWorkloadRaw,
    ] = await Promise.all([
      // 1. Recent Tickets
      prisma.ticket.findMany({
        where: { companyId, conversation: { isNot: null } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          // SELECT optimization
          id: true,
          subject: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
      }),
      // 2. Recent Users
      prisma.user.findMany({
        where: { companyId, role: { in: ["AGENT", "ADMIN"] } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, name: true, createdAt: true },
      }),
      // 3. Company Plan Info
      prisma.company.findUnique({
        where: { id: companyId },
        include: { plan: true }, // Needed full plan or select specific fields
      }),
      // 4. Counts
      prisma.ticket.count({
        where: {
          companyId,
          status: { notIn: ["RESOLVED", "CLOSED"] },
          conversation: { isNot: null },
        },
      }),
      // 5. Daily Messages
      prisma.message.count({
        where: { conversation: { companyId }, createdAt: { gte: today } },
      }),
      // 6. Active Convos
      prisma.conversation.count({
        where: { companyId, updatedAt: { gte: sevenDaysAgo } },
      }),
      // 7. Channel Stats
      prisma.message.groupBy({
        by: ["channel"],
        where: { conversation: { companyId } },
        _count: { id: true },
      }),
      // 8. Pipeline
      prisma.pipeline.findFirst({
        where: { companyId, isDefault: true },
        include: { stages: { orderBy: { order: "asc" } } },
      }),
      // 9. Top Agents (Complex aggregation)
      prisma.user.findMany({
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
        take: 5,
      }),
      // 10. Agent Workload
      prisma.user.findMany({
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
      }),
    ]);

    // AI Resolution & Avg Response Time (Separate Queries for clarity/optimization)
    // We only select necessary fields
    const [resolvedByAI, totalResolved, recentMessages] = await Promise.all([
      prisma.ticket.count({
        where: {
          companyId,
          status: { in: ["RESOLVED", "CLOSED"] },
          assignedToId: null,
          updatedAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.ticket.count({
        where: {
          companyId,
          status: { in: ["RESOLVED", "CLOSED"] },
          updatedAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.message.findMany({
        where: {
          conversation: { companyId },
          createdAt: { gte: sevenDaysAgo },
        },
        select: { createdAt: true, direction: true, conversationId: true },
        orderBy: { createdAt: "asc" },
        take: 500, // Reduced/Limited sample
      }),
    ]);

    // --- LOGIC PROCESSING ---

    // 1. Activities
    const activities: ActivityItem[] = [
      ...recentTickets.map((t) => {
        let text = `Ticket actualizado: ${t.subject}`;
        let icon = "📝";
        if (
          t.status === "OPEN" &&
          t.createdAt.getTime() === t.updatedAt.getTime()
        ) {
          text = `Nuevo ticket de '${t.createdBy?.name || "Usuario"}'`;
          icon = "💬";
        } else if (t.status === "RESOLVED" || t.status === "CLOSED") {
          text = `Ticket ${t.subject?.substring(0, 15)}... cerrado por '${t.assignedTo?.name || "Agente"}'`;
          icon = "✅";
        }
        return {
          id: `ticket-${t.id}`,
          type: "TICKET" as const,
          text,
          time: t.updatedAt,
          icon,
        };
      }),
      ...recentUsers.map((u) => ({
        id: `user-${u.id}`,
        type: "USER" as const,
        text: `Has agregado a '${u.name}' al equipo.`,
        time: u.createdAt,
        icon: "👥",
      })),
    ]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5);

    // 2. Metrics
    const aiResolutionRate =
      totalResolved > 0 ? Math.round((resolvedByAI / totalResolved) * 100) : 0;

    // Avg Response Time Calculation
    let avgResponseMs = 0;
    if (recentMessages.length > 1) {
      const conversationMap = new Map<string, { lastIncoming?: Date }>();
      let responseCount = 0;

      for (const msg of recentMessages) {
        if (!conversationMap.has(msg.conversationId))
          conversationMap.set(msg.conversationId, {});
        const conv = conversationMap.get(msg.conversationId)!;

        if (msg.direction === "INBOUND") {
          conv.lastIncoming = msg.createdAt;
        } else if (msg.direction === "OUTBOUND" && conv.lastIncoming) {
          avgResponseMs +=
            msg.createdAt.getTime() - conv.lastIncoming.getTime();
          responseCount++;
          conv.lastIncoming = undefined; // Reset pair
        }
      }
      if (responseCount > 0) avgResponseMs /= responseCount;
    }

    const avgResponseTime =
      avgResponseMs > 0
        ? avgResponseMs < 60000
          ? `${Math.round(avgResponseMs / 1000)}s`
          : `${Math.round(avgResponseMs / 60000)}m`
        : "0s";

    // 3. Sales Funnel
    let salesFunnel: any[] = [];
    if (defaultPipeline) {
      const dealsByStage = await prisma.deal.groupBy({
        by: ["stageId"],
        where: { pipelineId: defaultPipeline.id },
        _count: { id: true },
        _sum: { value: true },
      });
      salesFunnel = defaultPipeline.stages.map((stage) => {
        const stats = dealsByStage.find((d) => d.stageId === stage.id);
        return {
          name: stage.name,
          count: stats?._count.id || 0,
          value: stats?._sum.value || 0,
          color: stage.color ? `bg-[${stage.color}]` : "bg-slate-500",
        };
      });
    }

    // 4. Top Agents
    const topAgents = topAgentsRaw
      .map((agent) => ({
        name: agent.name,
        sales: agent._count.assignedDeals,
        score:
          agent._count.assignedDeals * 10 +
          agent._count.assignedConversations * 5,
        responseTime: "0m",
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(agent.name)}&background=random`,
      }))
      .sort((a, b) => b.score - a.score);

    // 5. Channel Distribution
    const totalActivity = channelStats.reduce(
      (acc, curr) => acc + curr._count.id,
      0,
    );
    const channelDistribution = channelStats
      .map((stat) => {
        let name = stat.channel as string;
        let color = "bg-gray-500";
        let iconClass = "fas fa-globe";
        let gradient = "from-gray-400 to-gray-600";

        switch (stat.channel) {
          case "WHATSAPP":
            name = "WhatsApp Business";
            color = "bg-green-500";
            gradient = "from-green-400 to-green-600";
            iconClass = "fab fa-whatsapp";
            break;
          case "INSTAGRAM_DM":
            name = "Instagram DM";
            color = "bg-pink-500";
            gradient = "from-pink-500 to-purple-600";
            iconClass = "fab fa-instagram";
            break;
          case "EMAIL":
            name = "Correo";
            color = "bg-blue-500";
            gradient = "from-blue-400 to-indigo-600";
            iconClass = "fas fa-envelope";
            break;
          case "WEB_CHAT":
            name = "Live Chat";
            color = "bg-indigo-500";
            gradient = "from-indigo-400 to-indigo-600";
            iconClass = "fas fa-comments";
            break;
        }
        return {
          channel: stat.channel,
          name,
          count: stat._count.id,
          percentage:
            totalActivity > 0
              ? Math.round((stat._count.id / totalActivity) * 100)
              : 0,
          color,
          gradient,
          iconClass,
        };
      })
      .sort((a, b) => b.count - a.count);

    // 6. Plan Data
    const limits = await planLimitsService.getPlanLimits(companyId);
    const usage = await planLimitsService.getCurrentUsage(companyId);
    const getLimit = (val: number | undefined) =>
      val === undefined || val === null ? -1 : val;
    const storageUsedGb = usage.storage_bytes / (1024 * 1024 * 1024);

    const planData: PlanDataDTO = {
      name: company?.plan?.name || "Sin Plan",
      expiresAt: company?.planExpiresAt,
      status: company?.status || "INACTIVE",
      isActive: company?.isActive ?? false,
      features: [
        { label: "Motor IA", enabled: limits?.enable_ai ?? false, icon: "cpu" },
        {
          label: "API & Webhooks",
          enabled: limits?.enable_api ?? false,
          icon: "webhook",
        },
        {
          label: "Marca Blanca",
          enabled: limits?.enable_whitelabel ?? false,
          icon: "shield",
        },
      ],
      usage: [
        {
          label: "Usuarios (Equipo)",
          used: usage.users,
          limit: getLimit(limits?.max_users),
          unit: "agentes",
        },
        {
          label: "Conexiones WhatsApp",
          used: usage.whatsapp_sessions,
          limit: getLimit(limits?.max_whatsapp_sessions),
          unit: "números",
        },
        {
          label: "Almacenamiento",
          used: parseFloat(storageUsedGb.toFixed(2)),
          limit: getLimit(limits?.storage_limit_gb),
          unit: "GB",
        },
        {
          label: "Contactos",
          used: usage.contacts,
          limit: getLimit(limits?.max_contacts),
          unit: "personas",
        },
        {
          label: "Colas de Atención",
          used: usage.queues,
          limit: getLimit(limits?.max_queues),
          unit: "colas",
        },
        // ... (truncated optional items for brevity or add all) ...
        {
          label: "Empresas",
          used: usage.companies,
          limit: getLimit(limits?.max_companies),
          unit: "orgs",
        },
      ],
    };

    // 7. Agent Workload
    const agentWorkload = agentWorkloadRaw
      .filter(
        (a: any) =>
          a._count.assignedTickets + a._count.assignedConversations > 0,
      )
      .map((a: any) => ({
        name: a.name,
        pending: a._count.assignedTickets,
        inProgress: a._count.assignedConversations,
      }));

    const result: DashboardStatsDTO = {
      activities,
      plan: planData,
      metrics: {
        activeTickets: activeTicketsCount,
        totalMessages: todayMessagesCount,
        activeConversations: activeConversationsCount,
        aiResolution: `${aiResolutionRate}%`,
        avgResponseTime,
      },
      salesFunnel,
      topAgents,
      channelDistribution,
      agentWorkload,
    };

    // Cache result
    if (redisClient?.isOpen) {
      redisClient
        .set(cacheKey, JSON.stringify(result), { EX: this.CACHE_TTL })
        .catch((e) => Logger.warn("Cache set failed", e));
    }

    return result;
  }

  /**
   * Sales Specific Stats
   */
  async getSalesStats(companyId: string): Promise<SalesStatsDTO> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Optimized Fetch
    const [deals, topAgents] = await Promise.all([
      prisma.deal.findMany({
        where: { companyId },
        select: {
          value: true,
          probability: true,
          updatedAt: true,
          stage: { select: { name: true } },
        },
      }),
      prisma.user.findMany({
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
        orderBy: { createdActivities: { _count: "desc" } },
        take: 5,
      }),
    ]);

    // Calculate metrics
    let pipelineValue = 0,
      forecastValue = 0,
      wonCount = 0,
      lostCount = 0,
      wonValue = 0;

    deals.forEach((deal) => {
      const stageName = deal.stage?.name || "";
      if (stageName !== "Ganado" && stageName !== "Perdido") {
        pipelineValue += deal.value;
        forecastValue += deal.value * (deal.probability / 100);
      }
      if (deal.updatedAt >= startOfMonth) {
        if (stageName === "Ganado") {
          wonCount++;
          wonValue += deal.value;
        } else if (stageName === "Perdido") lostCount++;
      }
    });

    const totalClosed = wonCount + lostCount;
    const conversionRate =
      totalClosed > 0 ? Math.round((wonCount / totalClosed) * 100) : 0;

    const leaderboard = topAgents.map((a: any) => ({
      id: a.id,
      name: a.name,
      activities: a._count.createdActivities,
      dealsWon: a._count.assignedDeals,
      avatar: null,
    }));

    return {
      forecast: Math.round(forecastValue),
      pipelineValue: Math.round(pipelineValue),
      wonCount,
      wonValue,
      conversionRate,
      leaderboard,
    };
  }

  /**
   * Dashboard Overview (Simplified)
   */
  async getDashboardOverview(companyId: string): Promise<OverviewMetricsDTO> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalContacts,
      activeCampaigns,
      messagesSentToday,
      recentCampaigns,
      recentContacts,
    ] = await Promise.all([
      prisma.contact.count({ where: { companyId } }),
      prisma.campaign.count({
        where: { companyId, status: { in: ["sending", "scheduled"] } },
      }),
      prisma.message.count({
        where: { conversation: { companyId }, createdAt: { gte: today } },
      }),
      prisma.campaign.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.contact.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, phone: true, createdAt: true },
      }),
    ]);

    const recentActivity: ActivityItem[] = [
      ...recentCampaigns.map((c) => ({
        id: `campaign-${c.id}`,
        type: "CAMPAIGN" as const,
        text: `Campaign "${c.name}" ${c.status}`,
        time: c.updatedAt || c.createdAt,
        icon:
          c.status === "completed"
            ? "✅"
            : c.status === "sending"
              ? "🚀"
              : "📢",
        metadata: { campaignId: c.id, status: c.status },
      })),
      ...recentContacts.map((c) => ({
        id: `contact-${c.id}`,
        type: "CONTACT" as const,
        text: `New contact: ${c.name || c.phone}`,
        time: c.createdAt,
        icon: "👤",
        metadata: { contactId: c.id },
      })),
    ]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5);

    return {
      totalContacts,
      activeCampaigns,
      messagesSentToday,
      recentActivity,
    };
  }
}

export const dashboardService = new DashboardService();
