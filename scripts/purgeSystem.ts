import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("☢️  INICIANDO PURGA NUCLEAR DEL SISTEMA...");

  try {
    // 1. Delete dependent data first (Messages, Tickets)
    console.log("🗑️  Eliminando Mensajes...");
    await prisma.message.deleteMany({});

    console.log("🗑️  Eliminando Tickets...");
    await prisma.ticket.deleteMany({});

    // 2. Delete Conversations
    console.log("🗑️  Eliminando Conversaciones...");
    await prisma.conversation.deleteMany({});

    // 3. Delete Contacts
    console.log("🗑️  Eliminando Contactos CRM...");
    await prisma.contact.deleteMany({});

    // 4. Delete Users (Except Admins/Masters)
    // We keep MASTERS and ADMINS to allow login
    console.log("🗑️  Eliminando Usuarios Clientes (Manteniendo Admins)...");
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        role: {
          notIn: ["ADMIN", "MASTER"],
        },
      },
    });
    console.log(`   -> Eliminados ${deletedUsers.count} usuarios.`);

    // 5. Delete Activities/Deals if any (Cleanup)
    console.log("🗑️  Limpiando Actividades y Negocios...");
    await prisma.activity.deleteMany({});
    await prisma.deal.deleteMany({});

    console.log("✅  PURGA COMPLETADA. El sistema está limpio.");
  } catch (error) {
    console.error("❌  Error durante la purga:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
