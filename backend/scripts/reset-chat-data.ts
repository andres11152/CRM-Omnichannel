import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  INICIANDO LIMPIEZA PROFUNDA DE DATOS DE CHAT...");

  try {
    // 1. Eliminar Mensajes (Dependen de Conversaciones y Usuarios)
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`✅ ${deletedMessages.count} Mensajes eliminados.`);

    // 2. Eliminar Tickets (Dependen de Conversaciones y Usuarios)
    const deletedTickets = await prisma.ticket.deleteMany({});
    console.log(`✅ ${deletedTickets.count} Tickets eliminados.`);

    // 3. Eliminar Conversaciones (Dependen de Compañía y Usuarios)
    // Primero desconectar participantes si es necesario, pero deleteMany debería funcionar en cascada si está configurado,
    // sino Prisma borrará la relación en tabla pivote automáticamente si es implícita.
    // Si es explícita, borrar pivote primero. Asumimos esquema estándar.
    const deletedConversations = await prisma.conversation.deleteMany({});
    console.log(`✅ ${deletedConversations.count} Conversaciones eliminadas.`);

    // 4. Eliminar Usuarios (Contactos de WhatsApp)
    // ⚠️ CRÍTICO: NO BORRAR AL ADMIN (Agente)
    // Borramos solo los que tienen el patrón de email de whatsapp o rol USER
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        OR: [{ email: { endsWith: "@whatsapp.user" } }, { role: "USER" }],
      },
    });
    console.log(
      `✅ ${deletedUsers.count} Contactos (Usuarios WhatsApp) eliminados.`,
    );

    console.log("✨ LIMPIEZA COMPLETADA CON ÉXITO. EL SISTEMA ESTÁ LIMPIO. ✨");
  } catch (error) {
    console.error("❌ ERROR DURANTE LA LIMPIEZA:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
