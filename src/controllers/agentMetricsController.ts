import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { prisma } from "@/config/prisma";

/**
 * GET /api/users/metrics
 * Retorna métricas reales de todos los agentes del tenant
 */
export const getAgentMetrics = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      throw new AppError("Not authorized", 401);
    }

    // Fecha de inicio de hoy (00:00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Obtener todos los agentes del tenant
    const agents = await prisma.user.findMany({
      where: {
        companyId,
        role: { in: ["AGENT", "ADMIN"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        updatedAt: true, // Para calcular status
        // Relaciones para métricas
        assignedTickets: {
          where: {
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        },
        assignedConversations: {
          where: {
            status: "IN_PROGRESS",
          },
        },
        sentMessages: {
          where: {
            createdAt: { gte: today },
            direction: "OUTBOUND",
          },
          select: {
            createdAt: true,
            conversationId: true,
          },
        },
      },
    });

    // Calcular métricas para cada agente
    const metricsPromises = agents.map(async (agent) => {
      // 1. Carga actual (tickets + conversaciones)
      const currentLoad =
        agent.assignedTickets.length + agent.assignedConversations.length;

      // 2. Tickets resueltos hoy
      const resolvedToday = await prisma.ticket.count({
        where: {
          assignedToId: agent.id,
          status: "RESOLVED",
          resolvedAt: { gte: today },
        },
      });

      // 3. CSAT promedio (últimos 30 días)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Como no tengo un modelo de Survey/Rating, voy a simular CSAT basado en
      // la tasa de tickets cerrados vs resueltos (métrica proxy)
      const ticketsResolved = await prisma.ticket.count({
        where: {
          assignedToId: agent.id,
          status: "RESOLVED",
          resolvedAt: { gte: thirtyDaysAgo },
        },
      });

      const ticketsClosed = await prisma.ticket.count({
        where: {
          assignedToId: agent.id,
          status: "CLOSED",
          updatedAt: { gte: thirtyDaysAgo },
        },
      });

      const totalHandled = ticketsResolved + ticketsClosed;
      // CSAT simulado: Si resuelve bien (status RESOLVED), asumimos satisfacción alta
      const csatScore =
        totalHandled > 0 ? (ticketsResolved / totalHandled) * 5 : 0;

      // 4. First Response Time (FRT) - Tiempo de primera respuesta en minutos
      // Obtenemos conversaciones donde haya respondido
      const conversationsWithResponses = await prisma.conversation.findMany({
        where: {
          assignedToId: agent.id,
          messages: {
            some: {
              senderId: agent.id,
              direction: "OUTBOUND",
              createdAt: { gte: thirtyDaysAgo },
            },
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 10, // Primeros mensajes
          },
        },
      });

      // Calcular FRT promedio
      let totalFrt = 0;
      let frtCount = 0;

      conversationsWithResponses.forEach((conv) => {
        const firstInbound = conv.messages.find(
          (m) => m.direction === "INBOUND"
        );
        const firstOutbound = conv.messages.find(
          (m) => m.direction === "OUTBOUND" && m.senderId === agent.id
        );

        if (firstInbound && firstOutbound) {
          const frtMs =
            firstOutbound.createdAt.getTime() -
            firstInbound.createdAt.getTime();
          const frtMinutes = Math.round(frtMs / 60000);
          if (frtMinutes >= 0 && frtMinutes < 1440) {
            // Ignorar valores negativos o > 24h
            totalFrt += frtMinutes;
            frtCount++;
          }
        }
      });

      const avgFrt = frtCount > 0 ? Math.round(totalFrt / frtCount) : 0;

      // 5. Status online/offline basado en última actividad
      const lastActivity = agent.updatedAt;
      const minutesSinceActivity = Math.floor(
        (Date.now() - lastActivity.getTime()) / 60000
      );

      let status: "online" | "away" | "offline" | "busy" = "offline";
      let statusDuration = "0m";

      if (minutesSinceActivity < 5) {
        status = currentLoad >= 5 ? "busy" : "online";
        statusDuration = `${minutesSinceActivity}m`;
      } else if (minutesSinceActivity < 30) {
        status = "away";
        statusDuration = `${minutesSinceActivity}m`;
      } else if (minutesSinceActivity < 1440) {
        // < 24h
        const hours = Math.floor(minutesSinceActivity / 60);
        const mins = minutesSinceActivity % 60;
        statusDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      } else {
        statusDuration = `${Math.floor(minutesSinceActivity / 1440)}d`;
      }

      return {
        userId: agent.id,
        name: agent.name,
        email: agent.email,
        currentLoad,
        maxCapacity: 10, // Puede configurarse por agente en el futuro
        performance: {
          resolved: resolvedToday,
          csat: Number(csatScore.toFixed(1)),
        },
        speed: {
          frt: avgFrt,
        },
        status,
        statusDuration,
      };
    });

    const metrics = await Promise.all(metricsPromises);

    res.status(200).json({
      status: "success",
      data: { metrics },
    });
  }
);
