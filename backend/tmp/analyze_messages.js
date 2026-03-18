const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Find the conversation
  const conv = await prisma.conversation.findFirst({
    where: { channelId: "573242450628" },
    select: { id: true },
  });

  if (!conv) {
    console.log("No conversation found for 573242450628");
    return;
  }

  console.log("Conversation ID:", conv.id);

  // Count total messages
  const total = await prisma.message.count({
    where: { conversationId: conv.id },
  });
  console.log("Total messages:", total);

  // Get messages grouped by content pattern
  const allMessages = await prisma.message.findMany({
    where: { conversationId: conv.id },
    select: {
      id: true,
      content: true,
      direction: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Count by media type
  const mediaCounts = {};
  const sampleMessages = [];

  for (const msg of allMessages) {
    const meta = msg.metadata;
    const mediaType = meta?.mediaType || "text";
    mediaCounts[mediaType] = (mediaCounts[mediaType] || 0) + 1;

    // Sample non-text messages
    if (mediaType !== "text" && sampleMessages.length < 20) {
      sampleMessages.push({
        id: msg.id.substring(0, 12),
        content: msg.content?.substring(0, 60),
        direction: msg.direction,
        mediaType,
        mediaFilename: meta?.mediaFilename,
        date: msg.createdAt,
      });
    }
  }

  console.log("\n=== Media Type Distribution ===");
  console.table(mediaCounts);

  console.log("\n=== Sample Media Messages ===");
  console.table(sampleMessages);

  // Check for document-like content without mediaType
  const docLike = allMessages.filter(
    (m) =>
      !m.metadata?.mediaType &&
      (m.content?.includes("[") ||
        m.content?.includes("Imagen") ||
        m.content?.includes("Audio") ||
        m.content?.includes("Documento") ||
        m.content?.includes(".pdf")),
  );

  if (docLike.length > 0) {
    console.log("\n=== Legacy Media Messages (no mediaType) ===");
    console.table(
      docLike.map((m) => ({
        content: m.content?.substring(0, 60),
        direction: m.direction,
        date: m.createdAt,
      })),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
