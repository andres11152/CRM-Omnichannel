import { Response, NextFunction } from "express";
import { prisma } from "@/config/prisma";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";

export const getDashboardStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID required" });
    }

    // 1. Fetch Recent Activity (Tickets & Users)
    const [recentTickets, recentUsers, companyData, userCount] =
      await Promise.all([
        prisma.ticket.findMany({
          where: {
            companyId,
            // Only show tickets with valid conversations
            conversation: {
              isNot: null,
            },
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

    // 3. Fetch Metrics
    const [activeTicketsCount, totalMessagesCount] = await Promise.all([
      prisma.ticket.count({
        where: {
          companyId,
          status: { notIn: ["RESOLVED", "CLOSED"] },
          // Only count tickets with valid conversations
          conversation: {
            isNot: null,
          },
        },
      }),
      prisma.message.count({
        where: {
          conversation: { companyId },
        },
      }),
    ]);

    // 4. Prepare Plan Data
    const planConfig = company?.plan?.config as any;
    const planData = {
      name: company?.plan?.name || "Sin Plan",
      agentLimit: planConfig?.max_users || 5, // Default to 5 if no config
      usedAgents: userCount,
    };

    res.status(200).json({
      status: "success",
      data: {
        activities,
        plan: planData,
        metrics: {
          activeTickets: activeTicketsCount,
          totalMessages: totalMessagesCount,
          aiResolution: "0%", // Placeholder
          avgResponseTime: "0s", // Placeholder
        },
      },
    });
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

    // 1. Fetch Deals
    const deals = await prisma.deal.findMany({
      where: { companyId },
      select: {
        value: true,
        stage: true,
        probability: true,
        updatedAt: true,
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
                stage: "WON",
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
      // Pipeline Value (All open deals)
      if (deal.stage !== "WON" && deal.stage !== "LOST") {
        pipelineValue += deal.value;
        forecastValue += deal.value * (deal.probability / 100);
      }

      // Won/Lost Stats (Monthly)
      if (deal.updatedAt >= startOfMonth) {
        if (deal.stage === "WON") {
          wonCount++;
          wonValue += deal.value;
        } else if (deal.stage === "LOST") {
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
