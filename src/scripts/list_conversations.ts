import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Listing conversations...");
  const conversations = await prisma.conversation.findMany({
    include: {
      participants: true,
      messages: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  conversations.forEach((c) => {
    console.log(`Conversation ID: ${c.id}`);
    console.log(`  Subject: ${c.subject}`);
    console.log(`  Participants:`);
    c.participants.forEach((p) => {
      console.log(`    - ${p.name} (${p.email}) [${p.role}]`);
    });
    console.log(`  Last Message: ${c.messages[0]?.content || "N/A"}`);
    console.log("---");
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
