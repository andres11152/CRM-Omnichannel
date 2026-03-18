const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const prisma = new PrismaClient();

async function main() {
  let out = "";
  const log = (str) => {
    out += str + "\n";
  };

  const conv = await prisma.conversation.findFirst({
    where: { channelId: "573242450628" },
    select: { id: true },
  });

  if (!conv) {
    fs.writeFileSync("tmp/recent_out.txt", "No conversation found");
    return;
  }

  const allMsgs = await prisma.message.findMany({
    where: { conversationId: conv.id },
    select: { content: true, direction: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" }, // newest first
  });

  log(`Total messages in DB: ${allMsgs.length}`);
  if (allMsgs.length > 0) {
    log(`Newest message: ${allMsgs[0].createdAt.toISOString()}`);
    log(
      `Oldest message: ${allMsgs[allMsgs.length - 1].createdAt.toISOString()}`,
    );
  }

  const mTypes = {};
  allMsgs.forEach((m) => {
    const t = m.metadata?.mediaType || "text-only";
    mTypes[t] = (mTypes[t] || 0) + 1;
  });
  log("Media Types Breakdown: " + JSON.stringify(mTypes));

  log("\n--- 5 NEWEST MESSAGES ---");
  allMsgs.slice(0, 5).forEach((m) => {
    log(
      `[${m.createdAt.toISOString()}] ${m.direction}: ${m.content} (media: ${m.metadata?.mediaType || "none"})`,
    );
  });

  fs.writeFileSync("tmp/recent_utf8.txt", out, "utf8");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
