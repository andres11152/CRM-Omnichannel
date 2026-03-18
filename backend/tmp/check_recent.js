const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const conv = await prisma.conversation.findFirst({
    where: { channelId: "573242450628" },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  if (!conv) {
    console.log("No conversation found");
    return;
  }

  const allMsgs = await prisma.message.findMany({
    where: { conversationId: conv.id },
    select: { content: true, direction: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" }, // newest first
  });

  console.log(`Total messages in DB: ${allMsgs.length}`);
  if (allMsgs.length > 0) {
    console.log(`Newest message: ${allMsgs[0].createdAt}`);
    console.log(`Oldest message: ${allMsgs[allMsgs.length - 1].createdAt}`);
  }

  const mTypes = {};
  allMsgs.forEach((m) => {
    const t = m.metadata?.mediaType || "text-only";
    mTypes[t] = (mTypes[t] || 0) + 1;
  });
  console.log("Media Types Breakdown:", mTypes);

  // Show the newest 5 messages
  console.log("\n--- 5 NEWEST MESSAGES ---");
  allMsgs.slice(0, 5).forEach((m) => {
    console.log(
      `[${m.createdAt.toISOString()}] ${m.direction}: ${m.content} (media: ${m.metadata?.mediaType || "none"})`,
    );
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
