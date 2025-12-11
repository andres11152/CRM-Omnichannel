import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanDuplicateChats() {
  console.log("🧹 Cleaning duplicate conversations...\n");

  // Get all companies
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });

  for (const company of companies) {
    console.log(`\n📊 Processing company: ${company.name}`);

    // Get all conversations for this company
    const conversations = await prisma.conversation.findMany({
      where: { companyId: company.id },
      include: {
        participants: true,
        messages: { take: 1 },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`  Found ${conversations.length} conversations`);

    // Group by phone number (extract digits only)
    const phoneGroups = new Map<string, typeof conversations>();

    for (const conv of conversations) {
      const cleanPhone = conv.channelId?.replace(/[^\d]/g, "") || "";
      if (cleanPhone.length > 5) {
        if (!phoneGroups.has(cleanPhone)) {
          phoneGroups.set(cleanPhone, []);
        }
        phoneGroups.get(cleanPhone)!.push(conv);
      }
    }

    // Find and handle duplicates
    let deletedCount = 0;
    for (const [phone, group] of phoneGroups.entries()) {
      if (group.length > 1) {
        console.log(
          `\n  ⚠️  Found ${group.length} duplicates for phone ${phone}`
        );

        // Keep the one with most messages, or the newest
        group.sort((a, b) => {
          const messagesCompare = b.messages.length - a.messages.length;
          if (messagesCompare !== 0) return messagesCompare;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });

        const keep = group[0];
        const toDelete = group.slice(1);

        console.log(`    ✅ Keeping: ${keep.id} (${keep.channelId})`);

        for (const dup of toDelete) {
          console.log(`    ❌ Deleting: ${dup.id} (${dup.channelId})`);

          // Delete messages first (cascade should handle this, but be safe)
          await prisma.message.deleteMany({
            where: { conversationId: dup.id },
          });

          // Delete tickets
          await prisma.ticket.deleteMany({
            where: { conversationId: dup.id },
          });

          // Delete conversation
          await prisma.conversation.delete({
            where: { id: dup.id },
          });

          deletedCount++;
        }
      }
    }

    console.log(`\n  ✨ Deleted ${deletedCount} duplicate conversations`);
  }

  console.log("\n✅ Cleanup completed!");
  await prisma.$disconnect();
}

cleanDuplicateChats().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
