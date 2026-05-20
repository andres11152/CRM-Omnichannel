import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  console.log("🧹 Starting purge of old @reply.com users and companies...");

  // 1. Buscar todos los usuarios con dominios heredados
  const oldUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: "@reply.com" } },
        { email: { endsWith: "@reply.ai" } },
      ],
    },
  });

  console.log(`Found ${oldUsers.length} old users to purge.`);

  for (const user of oldUsers) {
    console.log(`Purging user ${user.email} (ID: ${user.id})...`);
    
    // Limpiar relaciones complejas que no tienen cascada automática (onDelete: NoAction)
    
    // Eliminar reacciones de mensajes enviados por el usuario
    await prisma.messageReaction.deleteMany({
      where: { message: { senderId: user.id } },
    });

    // Eliminar mensajes enviados por el usuario
    await prisma.message.deleteMany({
      where: { senderId: user.id },
    });

    // Eliminar tickets creados o asignados al usuario
    await prisma.ticket.deleteMany({
      where: { OR: [{ createdById: user.id }, { assignedToId: user.id }] },
    });

    // Desasignar conversaciones asignadas al usuario
    await prisma.conversation.updateMany({
      where: { assignedToId: user.id },
      data: { assignedToId: null },
    });

    // Eliminar sesiones del agente
    await prisma.agentSession.deleteMany({
      where: { userId: user.id },
    });

    // Eliminar respuestas en el foro creadas por el usuario
    await prisma.reply.deleteMany({
      where: { authorId: user.id },
    });

    // Eliminar posts en el foro creados por el usuario
    await prisma.post.deleteMany({
      where: { authorId: user.id },
    });

    // Eliminar el registro del usuario definitivo
    await prisma.user.delete({
      where: { id: user.id },
    });

    console.log(`User ${user.email} purged successfully.`);
  }

  // 2. Renombrar y actualizar las empresas principales al nuevo dominio Sentry
  console.log("Updating companies to SentryCRM...");
  
  await prisma.company.updateMany({
    where: { id: "99999999-9999-9999-9999-999999999999" },
    data: {
      name: "Sentry Software (Master)",
      slug: "sentry-software",
    },
  });

  await prisma.company.updateMany({
    where: { id: "88888888-8888-8888-8888-888888888888" },
    data: {
      name: "Sentry Tenant Demo",
      slug: "sentry-tenant-demo",
    },
  });

  // 3. Eliminar registros huérfanos que puedan tener los viejos slugs
  await prisma.company.deleteMany({
    where: {
      slug: { in: ["reply-software", "reply-tenant-demo"] },
    },
  });

  console.log("✨ Purge and Domain Update Completed Successfully!");
}

run()
  .catch((err) => {
    console.error("❌ Purge script failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
