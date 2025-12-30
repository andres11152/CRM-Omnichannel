import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function mergeDuplicates() {
  console.log("🔍 Finding valid duplicates to merge...");

  // 1. Get all conversations with channelId
  const conversations = await prisma.conversation.findMany({
    where: {
      channelId: { not: null },
      status: { not: "CLOSED" }, // Only care about active ones mostly, but let's check all
    },
    select: {
      id: true,
      channelId: true,
      companyId: true,
      createdAt: true,
      _count: {
        select: { messages: true, tickets: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const grouped = new Map<string, typeof conversations>();

  for (const c of conversations) {
    if (!c.channelId) continue;
    const key = `${c.companyId}:${c.channelId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  let mergedCount = 0;

  for (const [key, chats] of grouped.entries()) {
    if (chats.length < 2) continue;

    console.log(`\nProcessing duplicates for key: ${key}`);

    // Strategy: Keep the OLDEST one as master (stable ID)
    // UNLESS the newest one has significantly more context?
    // Usually sticking to the oldest ID is best for deep links/history.
    const master = chats[0];
    const duplicates = chats.slice(1);

    console.log(
      `   👑 Master: ${
        master.id
      } (Created: ${master.createdAt.toISOString()}, Msgs: ${
        master._count.messages
      })`
    );

    for (const dup of duplicates) {
      console.log(
        `   ♻️  Merging Duplicate: ${
          dup.id
        } (Created: ${dup.createdAt.toISOString()}, Msgs: ${
          dup._count.messages
        })`
      );

      // 1. Move Messages
      const msgUpdate = await prisma.message.updateMany({
        where: { conversationId: dup.id },
        data: { conversationId: master.id },
      });
      console.log(`      ↳ Moved ${msgUpdate.count} messages.`);

      // 2. Move Tickets
      const ticketUpdate = await prisma.ticket.updateMany({
        where: { conversationId: dup.id },
        data: { conversationId: master.id },
      });
      console.log(`      ↳ Moved ${ticketUpdate.count} tickets.`);

      // 3. Delete Duplicate Conversation
      await prisma.conversation.delete({
        where: { id: dup.id },
      });
      console.log(`      ↳ 🗑️ Deleted conversation ${dup.id}`);

      mergedCount++;
    }
  }

  console.log(
    `\n✅ Merge complete. Merged ${mergedCount} duplicate conversations.`
  );
}

mergeDuplicates()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
