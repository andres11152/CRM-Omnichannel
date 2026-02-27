import { userRepository } from "@/repositories/UserRepository";
import { ticketRepository } from "@/repositories/TicketRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";

/**
 * 📊 AGENT METRICS SERVICE
 *
 * Data access layer for agent performance metrics.
 * Handles complex analytics queries for agent dashboards.
 */

interface AgentMetric {
  userId: string;
  name: string;
  email: string;
  currentLoad: number;
  maxCapacity: number;
  performance: { resolved: number; csat: number };
  speed: { frt: number };
  status: "online" | "away" | "offline" | "busy";
  statusDuration: string;
}

export const agentMetricsService = {
  async getMetrics(companyId: string): Promise<AgentMetric[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const agentsOutput = await userRepository.findMany({
      where: {
        companyId,
        role: { in: ["AGENT", "ADMIN"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        updatedAt: true,
        assignedTickets: {
          where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        },
        assignedConversations: {
          where: { status: "IN_PROGRESS" },
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

    const agents = agentsOutput as ((typeof agentsOutput)[0] & {
      assignedTickets: unknown[];
      assignedConversations: unknown[];
      sentMessages: unknown[];
    })[];

    const metricsPromises = agents.map(async (agent) => {
      const currentLoad =
        agent.assignedTickets.length + agent.assignedConversations.length;

      const resolvedToday = await ticketRepository.count({
        where: {
          assignedToId: agent.id,
          status: "RESOLVED",
          resolvedAt: { gte: today },
        },
      });

      const ticketsResolved = await ticketRepository.count({
        where: {
          assignedToId: agent.id,
          status: "RESOLVED",
          resolvedAt: { gte: thirtyDaysAgo },
        },
      });

      const ticketsClosed = await ticketRepository.count({
        where: {
          assignedToId: agent.id,
          status: "CLOSED",
          updatedAt: { gte: thirtyDaysAgo },
        },
      });

      const totalHandled = ticketsResolved + ticketsClosed;
      const csatScore =
        totalHandled > 0 ? (ticketsResolved / totalHandled) * 5 : 0;

      // First Response Time (FRT)
      const conversationsOutput = await conversationRepository.findMany({
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
            take: 10,
          },
        },
      });
      const conversationsWithResponses =
        conversationsOutput as ((typeof conversationsOutput)[0] & {
          messages: { direction: string; senderId: string; createdAt: Date }[];
        })[];

      let totalFrt = 0;
      let frtCount = 0;

      conversationsWithResponses.forEach((conv) => {
        const firstInbound = conv.messages.find(
          (m) => m.direction === "INBOUND",
        );
        const firstOutbound = conv.messages.find(
          (m) => m.direction === "OUTBOUND" && m.senderId === agent.id,
        );

        if (firstInbound && firstOutbound) {
          const frtMs =
            firstOutbound.createdAt.getTime() -
            firstInbound.createdAt.getTime();
          const frtMinutes = Math.round(frtMs / 60000);
          if (frtMinutes >= 0 && frtMinutes < 1440) {
            totalFrt += frtMinutes;
            frtCount++;
          }
        }
      });

      const avgFrt = frtCount > 0 ? Math.round(totalFrt / frtCount) : 0;

      // Status
      const lastActivity = agent.updatedAt;
      const minutesSinceActivity = Math.floor(
        (Date.now() - lastActivity.getTime()) / 60000,
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
        maxCapacity: 10,
        performance: {
          resolved: resolvedToday,
          csat: Number(csatScore.toFixed(1)),
        },
        speed: { frt: avgFrt },
        status,
        statusDuration,
      };
    });

    return await Promise.all(metricsPromises);
  },
};
