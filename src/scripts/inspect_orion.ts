import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Searching for Orion conversation...");
  // Search by partial subject match or just list recent ones
  const conversations = await prisma.conversation.findMany({
    where: {
      subject: { contains: "Orion" },
    },
    include: {
      participants: true,
      messages: { take: 5, orderBy: { createdAt: "desc" } },
    },
  });

  if (conversations.length === 0) {
    console.log('❌ No "Orion" conversation found. Listing all recent...');
    const recent = await prisma.conversation.findMany({
      take: 3,
      orderBy: { updatedAt: "desc" },
      include: {
        participants: true,
        messages: { take: 3, orderBy: { createdAt: "desc" } },
      },
    });
    console.log(JSON.stringify(recent, null, 2));
    return;
  }

  for (const conv of conversations) {
    console.log(`\nConversation: ${conv.subject} (${conv.id})`);
    console.log("Participants:");
    conv.participants.forEach((p) =>
      console.log(` - ${p.name} (${p.id}) [${p.role}]`)
    );

    console.log("Messages:");
    conv.messages.forEach((m) => {
      console.log(` - [${m.direction}] ${m.content} (Sender: ${m.senderId})`);
    });
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
