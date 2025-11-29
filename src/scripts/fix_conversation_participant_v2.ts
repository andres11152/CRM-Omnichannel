import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const conversationId = "cmijwc8m6000345ionsag81x3"; // ID from the logs
  const correctPhone = "573138081081";
  const correctEmail = `${correctPhone}@whatsapp.user`;

  console.log(`🔍 Inspecting conversation ${conversationId}...`);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  });

  if (!conversation) {
    console.error("❌ Conversation not found!");
    return;
  }

  // Find the user participant
  const userParticipant = conversation.participants.find(
    (p) => p.role === "USER"
  );

  if (!userParticipant) {
    console.error("❌ No user participant found in this conversation.");
    return;
  }

  console.log(
    `👤 Found participant: ${userParticipant.name} (${userParticipant.id})`
  );
  console.log(`📧 Current Email: ${userParticipant.email}`);

  if (userParticipant.email.startsWith("45")) {
    console.log(`⚠️ Detected wrong email! Updating to ${correctEmail}...`);

    // Check if a user with the correct email already exists to avoid unique constraint error
    const existingUser = await prisma.user.findUnique({
      where: { email: correctEmail },
    });

    if (existingUser) {
      console.log(
        `⚠️ User with ${correctEmail} already exists (${existingUser.id}). Merging...`
      );
      // Update conversation to point to the existing correct user
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          participants: {
            disconnect: { id: userParticipant.id },
            connect: { id: existingUser.id },
          },
        },
      });
      // Delete the old wrong user
      await prisma.user.delete({ where: { id: userParticipant.id } });
      console.log(
        "✅ Merged conversation to existing user and deleted old user."
      );
    } else {
      // Just update the email of the current user
      await prisma.user.update({
        where: { id: userParticipant.id },
        data: {
          email: correctEmail,
          name: correctPhone,
        },
      });
      console.log("✅ Updated user email and name.");
    }
  } else {
    console.log("✅ Email seems correct (or at least not the 45... one).");
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
