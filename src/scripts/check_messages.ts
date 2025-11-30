import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Checking last 5 messages...");
  const messages = await prisma.message.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { conversation: true },
  });

  messages.forEach((m) => {
    console.log(
      `[${m.direction}] ${m.content} (Conv: ${m.conversationId}) - ${m.createdAt}`
    );
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
