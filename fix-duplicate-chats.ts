import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("--- STARTING DUPLICATE CHAT MERGE ---");

  // 1. Get all customer users (role USER)
  const customers = await prisma.user.findMany({
    where: { role: "USER" },
    select: { id: true, name: true, companyId: true, email: true },
  });

  for (const customer of customers) {
    if (!customer.companyId) continue;

    // 2. Find conversations where this customer is a participant
    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: customer.companyId,
        participants: { some: { id: customer.id } },
      },
      orderBy: { updatedAt: "desc" }, // Newest first
      include: { messages: true },
    });

    if (conversations.length > 1) {
      console.log(
        `\nFound ${conversations.length} conversations for ${
          customer.name || customer.email
        } (${customer.id})`
      );

      // Master is the most recent (index 0)
      const master = conversations[0];
      const duplicates = conversations.slice(1);

      console.log(
        `> Master: ${master.id} (Updated: ${master.updatedAt}) - Messages: ${master.messages.length}`
      );

      for (const dup of duplicates) {
        console.log(
          `  - Merging duplicate: ${dup.id} (${dup.messages.length} msgs)`
        );

        // Move messages to Master
        await prisma.message.updateMany({
          where: { conversationId: dup.id },
          data: { conversationId: master.id },
        });

        // Delete duplicate conversation
        await prisma.conversation.delete({ where: { id: dup.id } });
      }
      console.log(`> Merged!`);
    }
  }

  console.log("\n--- FINISHED ---");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
