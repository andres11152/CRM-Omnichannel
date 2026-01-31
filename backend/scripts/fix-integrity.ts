import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🏥 STARTING DATA INTEGRITY CHECK...");

  // 1. Fetch all tickets that are assigned to someone and have a conversation
  const tickets = await prisma.ticket.findMany({
    where: {
      assignedToId: { not: null },
      conversationId: { not: null },
    },
    include: {
      conversation: true,
    },
  });

  console.log(
    `🔍 Checking ${tickets.length} assigned tickets for consistency...`,
  );

  let fixedCount = 0;
  let errors = 0;

  for (const ticket of tickets) {
    if (!ticket.conversation) continue;

    // Check if Conversation assignment matches Ticket assignment
    if (ticket.assignedToId !== ticket.conversation.assignedToId) {
      console.log(
        `⚠️ Mismatch Found: Ticket #${ticket.ticketNumber} (${ticket.assignedToId}) vs Conversation (${ticket.conversation.assignedToId})`,
      );

      try {
        await prisma.conversation.update({
          where: { id: ticket.conversationId! },
          data: {
            assignedToId: ticket.assignedToId,
            // Also sync queue if mismatch (optional, but good practice)
            queueId: ticket.queueId || undefined,
          },
        });
        console.log(
          `   ✅ FIXED: Conversation synced to Agent ${ticket.assignedToId}`,
        );
        fixedCount++;
      } catch (e) {
        console.error(`   ❌ FAILED to fix Ticket #${ticket.ticketNumber}:`, e);
        errors++;
      }
    }
  }

  console.log("\n-------------------------------------------");
  console.log(`🏁 INTEGRITY CHECK COMPLETE`);
  console.log(`✅ Fixed: ${fixedCount}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`👍 Consistent: ${tickets.length - fixedCount - errors}`);
  console.log("-------------------------------------------\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
