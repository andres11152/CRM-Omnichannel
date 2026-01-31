import { prisma } from "@/config/database";

export const assignTicketToAgent = async (
  ticketId: string,
  queueId: string,
) => {
  try {
    // 1. Obtener configuración de la cola y sus agentes ONLINE
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      include: {
        agents: {
          where: { isOnline: true }, // Filter by ONLINE status only
        },
      },
    });

    if (!queue || queue.type !== "ROUND_ROBIN") {
      console.log(
        `[AutoAssign] Queue ${queueId} is not ROUND_ROBIN or not found.`,
      );
      return;
    }

    if (queue.agents.length === 0) {
      console.log(`[AutoAssign] No ONLINE agents in queue ${queue.name}`);
      return;
    }

    // 2. Load Balancing with Capacity Check
    const eligibleAgents = [];

    for (const agent of queue.agents) {
      // Get current active load
      const currentLoad = await prisma.ticket.count({
        where: {
          assignedToId: agent.id,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      });

      // CHECK MAX CONCURRENCY from Agent settings
      // Enterprise Config: Default to 10 if not set in DB
      const DEFAULT_MAX_CONCURRENCY = 10;
      const maxCapacity =
        agent.maxConcurrency > 0
          ? agent.maxConcurrency
          : DEFAULT_MAX_CONCURRENCY;

      if (currentLoad < maxCapacity) {
        eligibleAgents.push({
          agentId: agent.id,
          name: agent.name,
          load: currentLoad,
          maxCapacity,
        });
      }
    }

    if (eligibleAgents.length === 0) {
      console.log(
        `[AutoAssign] All agents in queue ${queue.name} are at full capacity.`,
      );
      return;
    }

    // Sort by load (ascending)
    eligibleAgents.sort((a, b) => a.load - b.load);

    const candidate = eligibleAgents[0];

    if (candidate) {
      console.log(
        `[AutoAssign] Assigning ticket ${ticketId} to ${candidate.name} (Load: ${candidate.load}/${candidate.maxCapacity})`,
      );

      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          assignedToId: candidate.agentId,
          status: "IN_PROGRESS",
        },
      });
    }
  } catch (error) {
    console.error("[AutoAssign] Error assigning ticket:", error);
  }
};
