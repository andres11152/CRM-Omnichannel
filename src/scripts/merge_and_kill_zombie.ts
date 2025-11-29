import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const correctConvId = "cmijvgo2i000930qak7dsjr6o"; // The one with 57...
  const wrongConvId = "cmijwnpg6000bdytf4niigh9j"; // The one with AB (45...)

  console.log(`🔄 Merging ${wrongConvId} -> ${correctConvId}`);

  // 1. Move messages from wrong conversation to correct one
  const movedMessages = await prisma.message.updateMany({
    where: { conversationId: wrongConvId },
    data: { conversationId: correctConvId },
  });
  console.log(`✅ Moved ${movedMessages.count} messages.`);

  // 2. Find the correct user (57...)
  const correctUser = await prisma.conversation
    .findUnique({
      where: { id: correctConvId },
      include: { participants: true },
    })
    .then((c) => c?.participants.find((p) => p.role === "USER"));

  if (!correctUser) {
    console.error("❌ Correct user not found!");
    return;
  }

  // 3. Update sender of moved messages to be the correct user
  // (The messages in the wrong conv were sent by the "wrong" user)
  const wrongUser = await prisma.conversation
    .findUnique({
      where: { id: wrongConvId },
      include: { participants: true },
    })
    .then((c) => c?.participants.find((p) => p.role === "USER"));

  if (wrongUser) {
    console.log(
      `👤 Reassigning messages from ${wrongUser.email} to ${correctUser.email}`
    );
    await prisma.message.updateMany({
      where: { senderId: wrongUser.id },
      data: { senderId: correctUser.id },
    });

    // 4. Delete the wrong conversation
    await prisma.conversation.delete({ where: { id: wrongConvId } });
    console.log("✅ Deleted wrong conversation.");

    // 5. Delete the wrong user
    await prisma.user.delete({ where: { id: wrongUser.id } });
    console.log("✅ Deleted zombie user (45...).");
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
