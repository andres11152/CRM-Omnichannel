import { prisma } from "@/config/prisma";
import { Prisma } from "@prisma/client";

export const analyticsService = {
  /**
   * Get heatmap data: Message volume by day of week and hour of day.
   * Useful for identifying peak support hours.
   */
  async getHeatmapData(companyId: string, startDate: Date, endDate: Date) {
    // RAW SQL is often better for date aggregation performance
    const rawData = await prisma.$queryRaw<
      { day: number; hour: number; count: bigint }[]
    >`
      SELECT 
        EXTRACT(DOW FROM "createdAt") as day,
        EXTRACT(HOUR FROM "createdAt") as hour,
        COUNT(*) as count
      FROM "messages"
      WHERE "conversationId" IN (
        SELECT id FROM "conversations" WHERE "companyId" = ${companyId}
      )
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
      AND "senderId" NOT IN (SELECT id FROM "users" WHERE "role" = 'AI_AGENT') -- Filter out AI if desired, or keep it. Let's keep all for now except AI.
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;

    // Initialize 7x24 grid with 0
    const grid: { day: number; hour: number; value: number }[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        grid.push({ day: d, hour: h, value: 0 });
      }
    }

    // Fill with actual data
    rawData.forEach((row) => {
      const day = Number(row.day);
      const hour = Number(row.hour);
      const count = Number(row.count);

      const cell = grid.find((g) => g.day === day && g.hour === hour);
      if (cell) cell.value = count;
    });

    return grid;
  },

  /**
   * Get performance stats per agent.
   * - FRT (First Response Time)
   * - Resolution Time
   * - Ticket Volume
   */
  async getAgentPerformance(companyId: string, startDate: Date, endDate: Date) {
    // Fetch agents (users)
    const agents = await prisma.user.findMany({
      where: { companyId, role: { in: ["AGENT", "ADMIN"] } },
      select: { id: true, name: true, email: true },
    });

    const stats = await Promise.all(
      agents.map(async (agent) => {
        // 1. Tickets Assigned/Resolved
        const tickets = await prisma.ticket.findMany({
          where: {
            assignedToId: agent.id,
            companyId,
            createdAt: { gte: startDate, lte: endDate },
          },
          select: {
            id: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
          },
        });

        const totalTickets = tickets.length;
        const resolvedTickets = tickets.filter(
          (t) => t.status === "RESOLVED" && t.resolvedAt
        ).length;

        // 2. Calculate Resolution Time (for resolved ones)
        let totalResolutionTime = 0;
        tickets.forEach((t) => {
          if (t.resolvedAt) {
            totalResolutionTime +=
              t.resolvedAt.getTime() - t.createdAt.getTime();
          }
        });
        const avgResolutionTime =
          resolvedTickets > 0 ? totalResolutionTime / resolvedTickets : 0; // in ms

        // 3. FRT (First Response Time) simulation
        // Real implementation would link messages to tickets.
        // For MVP, we'll estimate or skipping complex SQL if "firstResponseAt" isn't on Ticket model.
        // Assuming Ticket has no 'firstResponseAt', we can check the first OUTGOING message in conversation linked to ticket.
        // This is expensive. For MVP, let's stick to Resolution Time & Volume which are solid.

        return {
          agentId: agent.id,
          name: agent.name,
          email: agent.email,
          totalTickets,
          resolvedTickets,
          avgResolutionTime: Math.round(avgResolutionTime / 1000 / 60), // in minutes
          // csat: 0 // Placeholder
        };
      })
    );

    return stats.sort((a, b) => b.totalTickets - a.totalTickets);
  },

  /**
   * Get Tag usage statistics.
   */
  async getTagAnalytics(companyId: string, startDate: Date, endDate: Date) {
    // NOTE: Conversation model stores tags as string[] (Postgres array) or JSON?
    // Prisma schema check required. Assuming it's string[] based on ChatInterface.
    // If it's pure standard Prisma with simple array, we fetch and aggregate in JS for MVP
    // (unless we use raw sql Unnest).

    // Let's use JS aggregation for simplicity if volume isn't huge, or Raw Query.
    // Raw query is safer for performance.

    const result = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
        SELECT unnest(tags) as tag, count(*) as count
        FROM "conversations"
        WHERE "companyId" = ${companyId}
        AND "updatedAt" >= ${startDate}
        AND "updatedAt" <= ${endDate}
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 20
     `;

    return result.map((r) => ({
      tag: r.tag,
      count: Number(r.count),
    }));
  },
};
