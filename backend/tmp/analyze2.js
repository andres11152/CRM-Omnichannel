const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const conv = await prisma.conversation.findFirst({
    where: { channelId: "573242450628" },
    select: { id: true },
  });

  if (!conv) {
    console.log("No conversation found");
    return;
  }

  // Check for media placeholders in content
  const allMsgs = await prisma.message.findMany({
    where: { conversationId: conv.id },
    select: { content: true, direction: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Find placeholder patterns
  const mediaPatterns = allMsgs.filter((m) => {
    const c = (m.content || "").trim();
    return c.startsWith("[") && c.endsWith("]");
  });

  console.log(`Total messages: ${allMsgs.length}`);
  console.log(
    `Messages with bracket placeholders [xxx]: ${mediaPatterns.length}`,
  );

  if (mediaPatterns.length > 0) {
    console.log("\n=== Bracket Placeholder Messages ===");
    mediaPatterns.forEach((m) => {
      console.log(
        `  ${m.direction} | ${m.content} | mediaType in meta: ${m.metadata?.mediaType || "NONE"} | ${m.createdAt}`,
      );
    });
  }

  // Also check for document filenames (e.g. ends with .pdf, .docx etc.)
  const docFiles = allMsgs.filter((m) => {
    const c = (m.content || "").trim().toLowerCase();
    return /\.(pdf|docx?|xlsx?|pptx?|zip|rar)$/i.test(c);
  });

  if (docFiles.length > 0) {
    console.log("\n=== Messages with file extension in content ===");
    docFiles.forEach((m) => {
      console.log(
        `  ${m.direction} | ${m.content} | mediaType: ${m.metadata?.mediaType || "NONE"}`,
      );
    });
  }

  // Sample of metadata to check structure
  const withMeta = allMsgs
    .filter((m) => m.metadata && Object.keys(m.metadata).length > 0)
    .slice(0, 3);
  console.log("\n=== Sample metadata ===");
  withMeta.forEach((m) => console.log(JSON.stringify(m.metadata)));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
