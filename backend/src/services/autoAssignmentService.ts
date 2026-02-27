import { prisma } from "@/config/database";
import { Logger } from "@/utils/logger";

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

    if (!queue) {
      Logger.warn(`[AutoAssign] Queue ${queueId} not found.`);
      return;
    }

    // 🧠 100-YEAR FIX: AI QUEUE HANDLING
    // If Queue is AI-managed, trigger the bot immediately
    if (queue.type === "AI" && queue.aiAssistantId) {
      Logger.info(
        `[AutoAssign] 🤖 Queue ${queue.name} is AI-managed. Triggering bot...`,
      );

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          conversation: {
            include: {
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      });

      if (ticket?.conversation?.messages?.[0]) {
        const lastMsg = ticket.conversation.messages[0];
        // Only trigger if last message was from user (INBOUND)
        // to avoid AI loop or responding to itself/other agents
        if (lastMsg.direction === "INBOUND") {
          try {
            // Dynamic import to avoid circular dep risks
            const { messageProcessor } =
              await import("./messageProcessorService");
            await messageProcessor._handleAIAutoResponse(
              ticket.conversationId!,
              lastMsg.id,
              lastMsg.content,
              queue.companyId,
            );
            Logger.info(`[AutoAssign] ✅ AI Response Triggered successfully`);
          } catch (err) {
            Logger.error(`[AutoAssign] ❌ Failed to trigger AI response`, err);
          }
        } else {
          Logger.info(`[AutoAssign] ⏩ Skipped AI: Last message was OUTBOUND`);
        }
      }
      return; // Stop here, no agent assignment needed
    }

    if (queue.type !== "ROUND_ROBIN") {
      Logger.warn(
        `[AutoAssign] Queue ${queue.name} is MANUAL (or unknown type). Skipping auto-assign.`,
      );
      return;
    }

    if (queue.agents.length === 0) {
      Logger.warn(`[AutoAssign] No ONLINE agents in queue ${queue.name}`);
      return;
    }

    // 1.5 SKILLS-BASED ROUTING (100-Year Logic)
    // Filter agents based on Queue's required skills configuration
    const config = queue.config as { requiredSkills?: string[] } | null;
    const requiredSkills = Array.isArray(config?.requiredSkills)
      ? config!.requiredSkills
      : [];

    let candidates = queue.agents;

    if (requiredSkills.length > 0) {
      candidates = candidates.filter((agent) => {
        const agentSkills = agent.skills || [];
        const hasAllSkills = requiredSkills.every((req) =>
          agentSkills.includes(req),
        );

        if (!hasAllSkills) {
          // Logger.debug(`[AutoAssign] Skipping ${agent.name} (Missing skills for ${queue.name})`);
        }
        return hasAllSkills;
      });

      if (candidates.length === 0) {
        Logger.warn(
          `[AutoAssign] No agents in ${queue.name} match required skills: ${requiredSkills.join(", ")}`,
        );
        return;
      }
    }

    // 2. Load Balancing with Capacity Check
    const eligibleAgents = [];

    for (const agent of candidates) {
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
      Logger.warn(
        `[AutoAssign] All agents in queue ${queue.name} are at full capacity.`,
      );
      return;
    }

    // Sort by load (ascending)
    eligibleAgents.sort((a, b) => a.load - b.load);

    const candidate = eligibleAgents[0];

    if (candidate) {
      Logger.info(
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
    Logger.error("[AutoAssign] Error assigning ticket:", error);
  }
};
