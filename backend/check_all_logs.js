const { PrismaClient } = require("c:/Users/Andres Betancourt/Desktop/Desarrollos Personales/Reply/Proyecto/backend/node_modules/@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("=== Last 20 messages in DB ===");
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      conversation: true
    }
  });

  messages.forEach((m) => {
    console.log(`[${m.createdAt.toISOString()}] [Conv: ${m.conversation?.channelId || m.conversationId}] [Dir: ${m.direction}] [Status: ${m.status}] ID: ${m.whatsappMessageId || m.id} - Content: "${m.content}" - Media: ${JSON.stringify(m.metadata)}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
