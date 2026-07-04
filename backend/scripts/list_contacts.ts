import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const contacts = await prisma.contact.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  console.log("Last 10 Contacts:", JSON.stringify(contacts, null, 2));

  const conversations = await prisma.conversation.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
    }
  });
  console.log("Last 10 Conversations:", JSON.stringify(conversations, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
