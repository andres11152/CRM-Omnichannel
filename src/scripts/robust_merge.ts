import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Searching for duplicate conversations...");

  // Find the "Good" user (57...)
  const goodUserEmail = "573242450628@whatsapp.user";
  const goodUser = await prisma.user.findUnique({
    where: { email: goodUserEmail },
  });

  if (!goodUser) {
    console.error("❌ Good user (57...) not found! Cannot merge.");
    return;
  }

  // Find conversations with "Bad" users (45...)
  const badConversations = await prisma.conversation.findMany({
    where: {
      participants: {
        some: {
          email: { startsWith: "45" },
        },
      },
    },
    include: { participants: true },
  });

  console.log(`Found ${badConversations.length} bad conversations.`);

  for (const badConv of badConversations) {
    console.log(`Processing bad conversation ${badConv.id}...`);

    // Find the bad participant
    const badParticipant = badConv.participants.find((p) =>
      p.email.startsWith("45")
    );
    if (!badParticipant) continue;

    // Find the target "Good" conversation (if exists, or we use the bad one and fix it)
    // Actually, let's look for an existing conversation for the GOOD user
    const goodConv = await prisma.conversation.findFirst({
      where: {
        participants: { some: { id: goodUser.id } },
        id: { not: badConv.id },
      },
    });

    if (goodConv) {
      console.log(`🔄 Merging ${badConv.id} -> ${goodConv.id}`);

      // Move messages
      await prisma.message.updateMany({
        where: { conversationId: badConv.id },
        data: { conversationId: goodConv.id },
      });

      // Reassign sender for messages from bad user
      await prisma.message.updateMany({
        where: { senderId: badParticipant.id },
        data: { senderId: goodUser.id },
      });

      // Delete bad conversation
      await prisma.conversation.delete({ where: { id: badConv.id } });
      console.log("✅ Merged and deleted bad conversation.");
    } else {
      console.log(
        `🛠️ No existing good conversation. Converting ${badConv.id} to good...`
      );
      // Just swap the participant
      await prisma.conversation.update({
        where: { id: badConv.id },
        data: {
          participants: {
            disconnect: { id: badParticipant.id },
            connect: { id: goodUser.id },
          },
        },
      });
      console.log("✅ Converted conversation to good user.");
    }

    // Try to delete the bad user
    try {
      await prisma.user.delete({ where: { id: badParticipant.id } });
      console.log("✅ Deleted bad user.");
    } catch (e) {
      console.log("⚠️ Could not delete bad user (maybe still used elsewhere).");
    }
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
