import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 INICIANDO LIMPIEZA PROFUNDA DE DATOS...");

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

    // 4. Delete Contacts
    const deletedContacts = await prisma.contact.deleteMany({});
    console.log(`🗑️ Contactos eliminados: ${deletedContacts.count}`);

    // 5. Delete WhatsApp Sessions (Force clean reconnect)
    const deletedSessions = await prisma.whatsAppSession.deleteMany({});
    console.log(`🗑️ Sesiones WA eliminadas: ${deletedSessions.count}`);

    // 6. Delete End Users (WhatsApp Customers) - PRESERVE ADMINS/AGENTS
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        role: "USER", // Only delete customers, keep Staff
      },
    });
    console.log(`🗑️ Usuarios Clientes eliminados: ${deletedUsers.count}`);

    // 7. Optional: Delete Dashboard Stats Cache or other transacional logs if exist
    // ...

    console.log("✨ BASE DE DATOS LIMPIA. LISTO PARA PRUEBAS.");
  } catch (error) {
    console.error("❌ Error durante la limpieza:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
