import { prisma } from "../config/database";
import { conversationRepository } from "../repositories/ConversationRepository";
import { ticketSyncService } from "../services/TicketSyncService";
import { runWithCompanyId } from "../context/requestContext";

async function run() {
  const ticketId = "cmph46s8900jn3t9l2rsxr6jt";
  const companyId = "88888888-8888-8888-8888-888888888888";

  await runWithCompanyId(companyId, async () => {
    try {
      console.log("Resolving conversationId...");
      let conversationId = ticketId;
      const exists = await conversationRepository.findByIdAndCompanyId(conversationId, companyId);
      console.log("Exists directly in conversations?", !!exists);
      
      if (!exists) {
        console.log("Not found in conversations. Resolving via TicketSyncService...");
        const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
        console.log("Resolved ticketConvId:", ticketConvId);
        if (ticketConvId) {
          conversationId = ticketConvId;
        }
      }

      console.log("Final conversationId:", conversationId);
      
      // Let's try updating conversation with this ID
      console.log("Attempting conversationRepository.update...");
      const updated = await conversationRepository.update(companyId, conversationId, {
        aiEnabled: false,
        lastManualIntervention: new Date(),
      });
      console.log("Conversation updated successfully!", updated.id);

    } catch (err) {
      console.error("Error inside context:", err);
    }
  });

  await prisma.$disconnect();
}

run();
