import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔪 INICIANDO CIRUGÍA DE DATOS... (SOLO CHAT)");
  console.log("============================================");

  try {
    // 1. Eliminar Mensajes (Dependen de Conversaciones)
    console.log("⏳ Eliminando Mensajes...");
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`✅ ${deletedMessages.count} Mensajes eliminados.`);

    // 2. Eliminar Tickets (Dependen de Conversaciones)
    console.log("⏳ Eliminando Tickets...");
    const deletedTickets = await prisma.ticket.deleteMany({});
    console.log(`✅ ${deletedTickets.count} Tickets eliminados.`);

    // 3. Eliminar Conversaciones (Padre)
    console.log("⏳ Eliminando Conversaciones...");
    // Primero, desvincular cualquier Ticket que pudiera haber quedado (si integrity checks fallan)
    // Pero deleteMany debería manejarlo si no hay dependencias circulares fuertes.
    const deletedConversations = await prisma.conversation.deleteMany({});
    console.log(`✅ ${deletedConversations.count} Conversaciones eliminadas.`);

    console.log("============================================");
    console.log("✨ CIRUGÍA COMPLETADA CON ÉXITO ✨");
    console.log(
      "El sistema está limpio de chats y tickets. (Usuarios/Contactos intactos)",
    );
  } catch (error) {
    console.error("❌ ERROR CRÍTICO DURANTE LA CIRUGÍA:", error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
