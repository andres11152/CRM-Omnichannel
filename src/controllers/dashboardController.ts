import { Response, NextFunction } from "express";
import { prisma } from "@/config/prisma";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { planLimitsService } from "@/services/planLimitsService";
import { Logger } from "@/utils/logger";

// 🛡️ CACHÉ EN MEMORIA PARA STATS (Fix memory leak)
interface StatsCache {
  data: any;
  expires: number;
}

const statsCache = new Map<string, StatsCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Limpiar caché expirado cada minuto
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of statsCache.entries()) {
    if (value.expires < now) {
      statsCache.delete(key);
      Logger.info(`[StatsCache] Cleaned expired cache for ${key}`);
    }
  }
}, 60000);

export const getDashboardStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID required" });
    }

    // 🛡️ CHECK CACHE FIRST
    const cacheKey = `stats:${companyId}`;
    const cached = statsCache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      Logger.info(`[StatsCache] HIT for ${companyId}`);
      return res.status(200).json(cached.data);
    }

    Logger.info(`[StatsCache] MISS for ${companyId}, fetching from DB...`);

    // 1. Fetch Recent Activity (Tickets & Users)
    const [recentTickets, recentUsers, companyData, userCount] =
      await Promise.all([
        prisma.ticket.findMany({
          where: {
            companyId,
            conversation: { isNot: null },
          },
          orderBy: { updatedAt: "desc" },
          take: 5,
          include: { createdBy: true, assignedTo: true },
        }),
        prisma.user.findMany({
          where: {
            companyId,
            role: { in: ["AGENT", "ADMIN"] },
          },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
        prisma.company.findUnique({
          where: { id: companyId },
          include: { plan: true },
        }),
        prisma.user.count({
          where: { companyId, role: { in: ["AGENT", "ADMIN"] } },
        }),
      ]);

    const company = companyData as any;

    // 2. Format Activity Feed
    const activities = [
      ...recentTickets.map((t) => {
        let text = `Ticket actualizado: ${t.subject}`;
        let icon = "📝";

        if (
          t.status === "OPEN" &&
          t.createdAt.getTime() === t.updatedAt.getTime()
        ) {
          text = `Nuevo ticket de '${t.createdBy.name || "Usuario"}'`;
          icon = "💬";
        } else if (t.status === "RESOLVED" || t.status === "CLOSED") {
          text = `Ticket ${t.subject.substring(0, 15)}... cerrado por '${
            t.assignedTo?.name || "Agente"
          }'`;
          icon = "✅";
        }

        return {
          id: `ticket-${t.id}`,
          type: "TICKET",
          text,
          time: t.updatedAt,
          icon,
        };
      }),
      ...recentUsers.map((u) => ({
        id: `user-${u.id}`,
        type: "USER",
        text: `Has agregado a '${u.name}' al equipo.`,
        time: u.createdAt,
        icon: "👥",
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5);

    // 3. Fetch Basic Metrics (REALISTIC CRM DATA)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      activeTicketsCount,
      todayMessagesCount,
      activeConversationsCount,
      recentMessages,
    ] = await Promise.all([
      // Active Tickets (Open, In Progress, Pending)
      prisma.ticket.count({
        where: {
          companyId,
          status: { notIn: ["RESOLVED", "CLOSED"] },
          conversation: { isNot: null },
        },
      }),
      // Messages sent TODAY (realistic daily activity)
      prisma.message.count({
        where: {
          conversation: { companyId },
          createdAt: { gte: today },
        },
      }),
      // Active conversations (last 7 days)
      prisma.conversation.count({
        where: {
          companyId,
          updatedAt: { gte: sevenDaysAgo },
        },
      }),
      // Recent messages for response time calculation
      prisma.message.findMany({
        where: {
          conversation: { companyId },
          createdAt: { gte: sevenDaysAgo },
        },
        select: {
          createdAt: true,
          direction: true,
          conversationId: true,
        },
        orderBy: { createdAt: "asc" },
        take: 200, // Sample for performance
      }),
    ]);

    // Calculate AI Resolution Rate
    const resolvedByAI = await prisma.ticket.count({
      where: {
        companyId,
        status: { in: ["RESOLVED", "CLOSED"] },
        assignedToId: null, // Not assigned = resolved by AI
        updatedAt: { gte: sevenDaysAgo },
      },
    });

    const totalResolved = await prisma.ticket.count({
      where: {
        companyId,
        status: { in: ["RESOLVED", "CLOSED"] },
        updatedAt: { gte: sevenDaysAgo },
      },
    });

    const aiResolutionRate =
      totalResolved > 0 ? Math.round((resolvedByAI / totalResolved) * 100) : 0;

    // Calculate Average Response Time (simplified)
    let avgResponseMs = 0;
    if (recentMessages.length > 1) {
      const conversationMap = new Map<
        string,
        { lastIncoming?: Date; lastOutgoing?: Date }
      >();

      recentMessages.forEach((msg) => {
        if (!conversationMap.has(msg.conversationId)) {
          conversationMap.set(msg.conversationId, {});
        }
        const conv = conversationMap.get(msg.conversationId)!;

        if (msg.direction === "INBOUND") {
          conv.lastIncoming = msg.createdAt;
        } else if (msg.direction === "OUTBOUND" && conv.lastIncoming) {
          const responseTime =
            msg.createdAt.getTime() - conv.lastIncoming.getTime();
          avgResponseMs = (avgResponseMs + responseTime) / 2;
        }
      });
    }

    const avgResponseTime =
      avgResponseMs > 0
        ? avgResponseMs < 60000
          ? `${Math.round(avgResponseMs / 1000)}s`
          : `${Math.round(avgResponseMs / 60000)}m`
        : "0s";

    // 4. SALES FUNNEL DATA (Real Stage Data)
    const defaultPipeline = await prisma.pipeline.findFirst({
      where: { companyId, isDefault: true },
      include: { stages: { orderBy: { order: "asc" } } },
    });

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

    // 5. TOP AGENTS (Real Performance Data)
    const topAgentsQuery = await prisma.user.findMany({
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
    });

    const topAgents = topAgentsQuery
      .map((agent) => ({
        name: agent.name,
        sales: agent._count.assignedDeals,
        // Simple score algorithm: 10 pts per sale, 5 pts per resolved chat
        score:
          agent._count.assignedDeals * 10 +
          agent._count.assignedConversations * 5,
        responseTime: "0m", // Real data requires complex query on messages table, defaulting to 0m to avoid mocks.
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
          agent.name
        )}&background=random`,
      }))
      .sort((a, b) => b.score - a.score);

    // 6. CHANNEL DISTRIBUTION
    // Note: Grouping by Message channel as Conversation model does not have a channel field in the current schema.
    // This represents "Activity Volume" by channel.
    const channelStats = await prisma.message.groupBy({
      by: ["channel"],
      where: { conversation: { companyId } },
      _count: { id: true },
    });

    const totalActivity = channelStats.reduce(
      (acc, curr) => acc + curr._count.id,
      0
    );

    // Map Prisma Enums to Friendly Names/Colors
    // Frontend expects: name, count, percentage, color (tailwind), icon (class)
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

    // 7. Prepare Plan Data (Detailed Scope using Service)
    const limits = await planLimitsService.getPlanLimits(companyId);
    const usage = await planLimitsService.getCurrentUsage(companyId);

    // Helper to format limit for UI (-1 -> Infinity handled by frontend, but here we pass value)
    const getLimit = (val: number | undefined) =>
      val === undefined || val === null ? -1 : val;

    const storageUsedGb = usage.storage_bytes / (1024 * 1024 * 1024);

    const planData = {
      name: company?.plan?.name || "Sin Plan",
      usage: [
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
          label: "Empresas",
          used: usage.companies,
          limit: getLimit(limits?.max_companies),
          unit: "empresas",
        },
        {
          label: "Workflows",
          used: usage.workflows,
          limit: getLimit(limits?.max_workflows),
          unit: "flujos",
        },
        // Legacy/Other useful stats
        {
          label: "Usuarios / Agentes",
          used: usage.users,
          limit: getLimit(limits?.max_users),
          unit: "usuarios",
        },
        {
          label: "Conexiones WhatsApp",
          used: usage.whatsapp_sessions,
          limit: getLimit(limits?.max_whatsapp_sessions),
          unit: "sesiones",
        },
      ],
    };

    // 8. ⚡ DISTRIBUCIÓN DE CARGA ACTIVA POR AGENTE (REAL DATA)
    const agentWorkloadRaw = await prisma.user.findMany({
      where: {
        companyId,
        role: { in: ["AGENT", "ADMIN"] },
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            assignedTickets: {
              where: {
                status: { in: ["OPEN", "IN_PROGRESS"] }, // ✅ CORREGIDO: Solo estados válidos
              },
            },
            assignedConversations: {
              where: {
                status: "IN_PROGRESS",
              },
            },
          },
        },
      },
    });

    const agentWorkload = agentWorkloadRaw
      .filter(
        (
          agent: any // ✅ Type assertion necesaria para _count
        ) =>
          agent._count.assignedTickets + agent._count.assignedConversations > 0
      ) // Solo agentes con carga
      .map((agent: any) => ({
        name: agent.name,
        pending: agent._count.assignedTickets, // Tickets pendientes/sin asignar
        inProgress: agent._count.assignedConversations, // Conversaciones en progreso
      }));

    const responseData = {
      status: "success",
      data: {
        activities,
        plan: planData,
        metrics: {
          activeTickets: activeTicketsCount,
          totalMessages: todayMessagesCount,
          activeConversations: activeConversationsCount,
          aiResolution: `${aiResolutionRate}%`,
          avgResponseTime: avgResponseTime,
        },
        salesFunnel,
        topAgents,
        channelDistribution,
        agentWorkload,
      },
    };

    // 🛡️ SAVE TO CACHE
    statsCache.set(cacheKey, {
      data: responseData,
      expires: Date.now() + CACHE_TTL,
    });

    res.status(200).json(responseData);
  }
);

export const getSalesStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID required" });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Fetch Deals with Stage relation
    const deals = await prisma.deal.findMany({
      where: { companyId },
      select: {
        value: true,
        probability: true,
        updatedAt: true,
        stage: {
          select: {
            name: true,
          },
        },
      },
    });

    // 2. Fetch Leaderboard (Agents by activities completed this month)
    const topAgents = await prisma.user.findMany({
      where: { companyId, role: { in: ["AGENT", "ADMIN"] } },
      select: {
        id: true,
        name: true,
        // avatarUrl removed as it doesn't exist
        _count: {
          select: {
            createdActivities: {
              where: {
                createdAt: { gte: startOfMonth },
                status: "COMPLETED",
              },
            },
            assignedDeals: {
              where: {
                stage: {
                  name: "Ganado",
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdActivities: {
          _count: "desc",
        },
      },
      take: 5,
    });

    // 3. Calculate Metrics
    let pipelineValue = 0;
    let forecastValue = 0;
    let wonCount = 0;
    let lostCount = 0;
    let wonValue = 0;

    deals.forEach((deal) => {
      const stageName = deal.stage?.name || "";

      // Pipeline Value (All open deals - exclude won/lost)
      if (stageName !== "Ganado" && stageName !== "Perdido") {
        pipelineValue += deal.value;
        forecastValue += deal.value * (deal.probability / 100);
      }

      // Won/Lost Stats (Monthly)
      if (deal.updatedAt >= startOfMonth) {
        if (stageName === "Ganado") {
          wonCount++;
          wonValue += deal.value;
        } else if (stageName === "Perdido") {
          lostCount++;
        }
      }
    });

    const totalClosedThisMonth = wonCount + lostCount;
    const conversionRate =
      totalClosedThisMonth > 0
        ? Math.round((wonCount / totalClosedThisMonth) * 100)
        : 0;

    // 4. Format Leaderboard
    const leaderboard = topAgents.map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      activities: agent._count.createdActivities,
      dealsWon: agent._count.assignedDeals,
      avatar: null,
    }));

    res.status(200).json({
      status: "success",
      data: {
        forecast: Math.round(forecastValue),
        pipelineValue: Math.round(pipelineValue),
        wonCount, // This month
        wonValue, // This month
        conversionRate,
        leaderboard,
      },
    });
  }
);
