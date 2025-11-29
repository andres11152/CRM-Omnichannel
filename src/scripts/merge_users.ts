import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const conversationId = "cmijwc8m6000345ionsag81x3";
  const correctPhone = "573138081081";
  const correctEmail = `${correctPhone}@whatsapp.user`;

  console.log(`🔍 Fixing conversation ${conversationId}...`);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  });

  if (!conversation) return;

  const oldUser = conversation.participants.find((p) =>
    p.email.startsWith("45")
  );
  if (!oldUser) {
    console.log("✅ No old user found in conversation.");
    return;
  }

  const newUser = await prisma.user.findUnique({
    where: { email: correctEmail },
  });
  if (!newUser) {
    console.error(
      "❌ New user not found. Run previous script or create manually."
    );
    return;
  }

  console.log(
    `🔄 Merging Old User (${oldUser.id}) -> New User (${newUser.id})`
  );

  // 1. Update messages ownership
  const updatedMessages = await prisma.message.updateMany({
    where: { senderId: oldUser.id },
    data: { senderId: newUser.id },
  });
  console.log(`✅ Updated ${updatedMessages.count} messages.`);

  // 2. Update conversation participants
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      participants: {
        disconnect: { id: oldUser.id },
        connect: { id: newUser.id },
      },
    },
  });
  console.log("✅ Updated conversation participants.");

  // 3. Delete old user
  try {
    await prisma.user.delete({ where: { id: oldUser.id } });
    console.log("✅ Deleted old user.");
  } catch (e) {
    console.error(
      "⚠️ Could not delete old user (might have other dependencies):",
      e
    );
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
