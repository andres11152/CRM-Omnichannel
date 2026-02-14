import { dashboardRepository } from "@/repositories/DashboardRepository";
import { cacheService } from "@/services/cacheService";
import { planLimitsService } from "@/services/planLimitsService";

// --- DTOs ---

export interface ActivityItem {
  id: string;
  type: "TICKET" | "USER" | "CAMPAIGN" | "CONTACT";
  text: string;
  time: Date;
  icon: string;
  metadata?: Record<string, unknown>;
}

export interface PlanDataDTO {
  name: string;
  price?: number;
  expiresAt?: Date | null;
  trialEndsAt?: Date | null;
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

export interface AgentStatsDTO {
  activeTickets: number;
  resolvedToday: number;
  messagesSentToday: number;
  recentTickets: {
    id: string;
    ticketNumber: number;
    subject: string;
    status: string;
    priority: string;
    queueName: string;
    updatedAt: Date;
  }[];
}

// --- SERVICE ---

export class DashboardService {
  /**
   * Main Dashboard Stats
   * Cached for 60s using CacheService.wrap
   */
  async getDashboardStats(companyId: string): Promise<DashboardStatsDTO> {
    const fetcher = async (): Promise<DashboardStatsDTO> => {
      // 1. Parallel Data Fetching
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

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
        dashboardRepository.getRecentTickets(companyId, 5),
        dashboardRepository.getRecentUsers(companyId, 3),
        dashboardRepository.getCompanyWithPlan(companyId),
        dashboardRepository.countActiveTickets(companyId),
        dashboardRepository.countTodayMessages(companyId, today),
        dashboardRepository.countActiveConversations(companyId, sevenDaysAgo),
        dashboardRepository.getMessageCountByChannel(companyId),
        dashboardRepository.getDefaultPipeline(companyId),
        dashboardRepository.getAgentsWithDealAndConvoStats(companyId, 5),
        dashboardRepository.getAgentsWithWorkloadStats(companyId),
      ]);

      const [resolvedByAI, totalResolved, recentMessages] = await Promise.all([
        dashboardRepository.countResolvedTickets(companyId, sevenDaysAgo, true),
        dashboardRepository.countResolvedTickets(
          companyId,
          sevenDaysAgo,
          false,
        ),
        dashboardRepository.getRecentMessagesForSpeed(
          companyId,
          sevenDaysAgo,
          500,
        ),
      ]);

      // Process logic...
      const activities: ActivityItem[] = [
        ...recentTickets.map((t) => ({
          id: `ticket-${t.id}`,
          type: "TICKET" as const,
          text:
            t.status === "OPEN"
              ? `Nuevo ticket: ${t.subject}`
              : `Ticket cerrado: ${t.subject}`,
          time: t.updatedAt,
          icon: t.status === "OPEN" ? "💬" : "✅",
        })),
        ...recentUsers.map((u) => ({
          id: `user-${u.id}`,
          type: "USER" as const,
          text: `Nuevo agente: ${u.name}`,
          time: u.createdAt,
          icon: "👥",
        })),
      ].sort((a, b) => b.time.getTime() - a.time.getTime());

      const aiResolutionRate =
        totalResolved > 0
          ? Math.round((resolvedByAI / totalResolved) * 100)
          : 0;

      let avgResponseMs = 0;
      if (recentMessages.length > 1) {
        const conversationMap = new Map<string, Date>();
        let responseCount = 0;
        for (const msg of recentMessages) {
          if (msg.direction === "INBOUND") {
            conversationMap.set(msg.conversationId, msg.createdAt);
          } else if (
            msg.direction === "OUTBOUND" &&
            conversationMap.has(msg.conversationId)
          ) {
            avgResponseMs +=
              msg.createdAt.getTime() -
              conversationMap.get(msg.conversationId)!.getTime();
            responseCount++;
            conversationMap.delete(msg.conversationId);
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

      let salesFunnel: {
        name: string;
        count: number;
        value: number;
        color: string;
      }[] = [];
      if (defaultPipeline) {
        const dealsByStage = await dashboardRepository.getDealsByStage(
          defaultPipeline.id,
        );
        salesFunnel = defaultPipeline.stages.map((stage) => {
          const stats = dealsByStage.find((d) => d.stageId === stage.id);
          return {
            name: stage.name,
            count: stats?._count.id || 0,
            value: stats?._sum.value || 0,
            color: stage.color || "#6b7280",
          };
        });
      }

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

      const totalActivity = channelStats.reduce(
        (acc, curr) => acc + curr._count.id,
        0,
      );
      const channelDistribution = channelStats
        .map((stat) => ({
          channel: stat.channel,
          name: stat.channel,
          count: stat._count.id,
          percentage:
            totalActivity > 0
              ? Math.round((stat._count.id / totalActivity) * 100)
              : 0,
          color: "bg-blue-500",
          gradient: "from-blue-400 to-blue-600",
          iconClass: "fas fa-globe",
        }))
        .sort((a, b) => b.count - a.count);

      const limits = await planLimitsService.getPlanLimits(companyId);
      const usage = await planLimitsService.getCurrentUsage(companyId);

      // 🏗️ ENTERPRISE: Build REAL features list from plan config
      const features: { label: string; enabled: boolean; icon: string }[] = [
        { label: "IA", enabled: limits?.enable_ai ?? false, icon: "🤖" },
        { label: "API", enabled: limits?.enable_api ?? false, icon: "🔌" },
        {
          label: "White Label",
          enabled: limits?.enable_whitelabel ?? false,
          icon: "🏷️",
        },
      ];

      // 🏗️ ENTERPRISE: Build COMPLETE usage metrics from real data
      const usageMetrics: {
        label: string;
        used: number;
        limit: number;
        unit: string;
      }[] = [
        {
          label: "Usuarios",
          used: usage.users,
          limit: limits?.max_users || 0,
          unit: "agentes",
        },
        {
          label: "WhatsApp",
          used: usage.whatsapp_sessions,
          limit: limits?.max_whatsapp_sessions || 0,
          unit: "números",
        },
        {
          label: "Colas",
          used: usage.queues,
          limit: limits?.max_queues || 0,
          unit: "colas",
        },
        {
          label: "Tickets / Mes",
          used: usage.tickets_this_month,
          limit: limits?.max_tickets_per_month ?? -1,
          unit: "tickets",
        },
        {
          label: "Asistentes IA",
          used: usage.ai_assistants,
          limit: limits?.max_ai_assistants ?? -1,
          unit: "bots",
        },
        {
          label: "Almacenamiento",
          used:
            Math.round((usage.storage_bytes / (1024 * 1024 * 1024)) * 100) /
            100,
          limit: limits?.storage_limit_gb ?? -1,
          unit: "GB",
        },
        {
          label: "Contactos",
          used: usage.contacts,
          limit: limits?.max_contacts ?? -1,
          unit: "contactos",
        },
        {
          label: "Empresas (CRM)",
          used: usage.companies,
          limit: limits?.max_companies ?? -1,
          unit: "cuentas",
        },
        {
          label: "Workflows",
          used: usage.workflows,
          limit: limits?.max_workflows ?? -1,
          unit: "activos",
        },
      ];

      return {
        activities,
        plan: {
          name: company?.plan?.name || "Sin Plan",
          price: company?.plan?.price ?? 0,
          expiresAt: company?.planExpiresAt,
          trialEndsAt: company?.trialEndsAt,
          status: company?.status || "INACTIVE",
          isActive: company?.isActive ?? false,
          features,
          usage: usageMetrics,
        },
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
        agentWorkload: agentWorkloadRaw.map((a) => ({
          name: a.name,
          pending: a._count.assignedTickets,
          inProgress: a._count.assignedConversations,
        })),
      };
    };

    // 🛡️ CIRCUIT BREAKER: Try cache first, fall back to direct fetch if Redis fails
    try {
      return await cacheService.wrap(
        `dashboard:stats:${companyId}`,
        fetcher,
        60,
      );
    } catch (cacheError) {
      console.warn(
        "[DashboardService] Cache failed, computing stats directly:",
        cacheError,
      );
      return fetcher();
    }
  }

  async getSalesStats(companyId: string): Promise<SalesStatsDTO> {
    return cacheService.wrap(
      `dashboard:sales:${companyId}`,
      async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [deals, topAgents] = await Promise.all([
          dashboardRepository.getAllDealsForSales(companyId),
          dashboardRepository.getTopAgentsForMonthlyActivity(
            companyId,
            startOfMonth,
            5,
          ),
        ]);

        let pipelineValue = 0,
          wonValue = 0,
          wonCount = 0;
        deals.forEach((deal) => {
          if (deal.stage?.name === "Ganado") {
            wonCount++;
            wonValue += deal.value;
          } else {
            pipelineValue += deal.value;
          }
        });

        return {
          forecast: 0,
          pipelineValue,
          wonCount,
          wonValue,
          conversionRate: 0,
          leaderboard: topAgents.map((a) => ({
            id: a.id,
            name: a.name,
            activities: a._count.createdActivities,
            dealsWon: a._count.assignedDeals,
            avatar: null,
          })),
        };
      },
      60,
    );
  }

  async getDashboardOverview(companyId: string): Promise<OverviewMetricsDTO> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [counts, recents] = await Promise.all([
      dashboardRepository.getOverviewStats(companyId, today),
      dashboardRepository.getRecentCampaignsAndContacts(companyId, 5),
    ]);

    const [totalContacts, activeCampaigns, messagesSentToday] = counts;
    const [recentCampaigns, recentContacts] = recents;

    return {
      totalContacts,
      activeCampaigns,
      messagesSentToday,
      recentActivity: [
        ...recentCampaigns.map((c) => ({
          id: `campaign-${c.id}`,
          type: "CAMPAIGN" as const,
          text: `Campaña: ${c.name}`,
          time: c.createdAt,
          icon: "📢",
        })),
        ...recentContacts.map((c) => ({
          id: `contact-${c.id}`,
          type: "CONTACT" as const,
          text: `Nuevo contacto: ${c.name}`,
          time: c.createdAt,
          icon: "👤",
        })),
      ].sort((a, b) => b.time.getTime() - a.time.getTime()),
    };
  }
  async getAgentStats(
    companyId: string,
    agentId: string,
  ): Promise<AgentStatsDTO> {
    const fetcher = async () => {
      const [activeTickets, resolvedToday, messagesSentToday, recentTickets] =
        await dashboardRepository.getAgentStats(companyId, agentId);

      return {
        activeTickets,
        resolvedToday,
        messagesSentToday,
        recentTickets: recentTickets.map((t) => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
          queueName: t.queue?.name || "General",
          updatedAt: t.updatedAt,
        })),
      };
    };

    try {
      return await cacheService.wrap(
        `dashboard:agent:${companyId}:${agentId}`,
        fetcher,
        30,
      );
    } catch {
      return fetcher();
    }
  }
}

export const dashboardService = new DashboardService();
