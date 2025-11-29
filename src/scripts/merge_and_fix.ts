import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const currentPhone = "3242450628";
  const currentEmail = `${currentPhone}@whatsapp.user`;

  const correctPhone = "573242450628";
  const correctEmail = `${correctPhone}@whatsapp.user`;

  console.log(`🔍 Finding user ${currentPhone}...`);
  const user = await prisma.user.findUnique({ where: { email: currentEmail } });

  if (!user) {
    console.log("⚠️ User not found with short number. Maybe already updated?");
  } else {
    console.log(`🛠️ Updating user to ${correctPhone}...`);
    await prisma.user.update({
      where: { id: user.id },
      data: { email: correctEmail, name: correctPhone },
    });
    console.log("✅ User updated.");
  }

  // Now handle duplicate conversations
  // We know the IDs from the previous list
  const keepConvId = "cmijvgo2i000930qak7dsjr6o";
  const deleteConvId = "cmijwc8m6000345ionsag81x3";

  console.log(`🔄 Merging conversation ${deleteConvId} into ${keepConvId}...`);

  // Move messages
  const movedMessages = await prisma.message.updateMany({
    where: { conversationId: deleteConvId },
    data: { conversationId: keepConvId },
  });
  console.log(`✅ Moved ${movedMessages.count} messages.`);

  // Delete the empty conversation
  await prisma.conversation.delete({ where: { id: deleteConvId } });
  console.log("✅ Deleted duplicate conversation.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
