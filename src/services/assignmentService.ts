import { prisma } from "@/config/prisma";

/**
 * Assigns a ticket to the best available agent in the queue using Round Robin / Load Balancing.
 * Strategy: Find agent with lowest current load (count of assigned tickets with status OPEN/IN_PROGRESS).
 */
export const assignTicketToAgent = async (
  ticketId: string,
  queueId: string
) => {
  console.log(
    `[AutoAssignment] Attempting to assign ticket ${ticketId} in queue ${queueId}`
  );

  // 1. Get Queue to check type (double check)
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { agents: true },
  });

  if (!queue) {
    console.error(`[AutoAssignment] Queue ${queueId} not found`);
    return;
  }

  if (queue.type !== "ROUND_ROBIN") {
    console.log(
      `[AutoAssignment] Queue ${queue.name} is not configured for Round Robin. Skipping.`
    );
    return;
  }

  const agents = queue.agents;

  if (!agents || agents.length === 0) {
    console.log(`[AutoAssignment] No agents in queue ${queue.name}.`);
    return;
  }

  // 2. Calculate Load for each agent
  // We need to count tickets assigned to each agent that are not resolved/closed.
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
    })
  );

  // 3. Sort by Load (Ascending)
  agentsWithLoad.sort((a, b) => a.load - b.load);

  // 4. Pick the best agent
  // TODO: Check for "Online" status when available in User model.
  const bestAgent = agentsWithLoad[0].agent;
  const currentLoad = agentsWithLoad[0].load;

  console.log(
    `[AutoAssignment] Assigning to ${bestAgent.name} (Load: ${currentLoad})`
  );

  // 5. Assign Ticket
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assignedToId: bestAgent.id,
    },
  });

  return bestAgent;
};
