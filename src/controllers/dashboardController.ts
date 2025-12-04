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
          where: { companyId },
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

    // 3. Fetch Metrics (Optional optimization: do this here instead of frontend)
    // For now, we return activities.

    // 3. Prepare Plan Data
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
      },
    });
  }
);
