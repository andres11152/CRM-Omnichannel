import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log(
    "🧹 INICIANDO LIMPIEZA DE MENSAJES, TICKETS, Y CONVERSACIONES...",
  );

  try {
    // 1. Delete Messages (Child of Conversation)
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`🗑️ Mensajes eliminados: ${deletedMessages.count}`);

    // 2. Delete Tickets (Child of Conversation/User)
    const deletedTickets = await prisma.ticket.deleteMany({});
    console.log(`🗑️ Tickets eliminados: ${deletedTickets.count}`);

    // 3. Delete Conversations (Main transactional entity)
    const deletedConversations = await prisma.conversation.deleteMany({});
    console.log(`🗑️ Conversaciones eliminadas: ${deletedConversations.count}`);

    console.log("✨ LIMPIEZA COMPLETADA.");
  } catch (error) {
    console.error("❌ Error durante la limpieza:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
