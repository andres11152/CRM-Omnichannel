const { PrismaClient } = require("c:/Users/Andres Betancourt/Desktop/Desarrollos Personales/Reply/Proyecto/backend/node_modules/@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const phone = "573242450628";
  console.log(`=== last 15 messages for contact phone ${phone} ===`);
  
  // Find conversation
  const conversations = await prisma.conversation.findMany({
    where: {
      channelId: { contains: phone }
    }
  });
  
  if (conversations.length === 0) {
    console.log("No conversation found for phone:", phone);
    return;
  }
  
  const conversation = conversations[0];
  console.log("Found Conversation:", JSON.stringify(conversation, null, 2));
  
  const messages = await prisma.message.findMany({
    where: {
      conversationId: conversation.id
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 15
  });
  
  console.log("Messages:");
  messages.reverse().forEach((m) => {
    console.log(`[${m.createdAt.toISOString()}] [${m.direction}] [Status: ${m.status}] ID: ${m.whatsappMessageId || m.id} - Content: "${m.content}" - Media: ${JSON.stringify(m.metadata)}`);
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
