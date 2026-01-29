import { prisma } from "@/config/database";
import { Logger } from "@/utils/logger";

/**
 * Assigns a ticket to the best available agent in the queue using Round Robin / Load Balancing.
 */
export const assignTicketToAgent = async (
  ticketId: string,
  queueId: string,
) => {
  Logger.info(
    `[AutoAssignment] Attempting to assign ticket ${ticketId} in queue ${queueId}`,
  );

  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { agents: true },
  });

  if (!queue) {
    Logger.error(`[AutoAssignment] Queue ${queueId} not found`);
    return;
  }

  if (queue.type !== "ROUND_ROBIN") {
    Logger.info(
      `[AutoAssignment] Queue ${queue.name} is not configured for Round Robin. Skipping.`,
    );
    return;
  }

  const agents = queue.agents;

  if (!agents || agents.length === 0) {
    Logger.info(`[AutoAssignment] No agents in queue ${queue.name}.`);
    return;
  }

  // Calculate Load for each agent
  const agentsWithLoad = await Promise.all(
    agents.map(async (agent) => {
      const load = await prisma.ticket.count({
        where: {
          assignedToId: agent.id,
          status: {
            in: ["OPEN", "IN_PROGRESS"],
          },
        },
      });
      return { agent, load };
    }),
  );

  // Sort by Load (Ascending)
  agentsWithLoad.sort((a, b) => a.load - b.load);

  const bestAgent = agentsWithLoad[0].agent;
  const currentLoad = agentsWithLoad[0].load;

  Logger.info(
    `[AutoAssignment] Assigning to ${bestAgent.name} (Load: ${currentLoad})`,
  );

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assignedToId: bestAgent.id,
    },
  });

  return bestAgent;
};
