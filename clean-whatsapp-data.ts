import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function cleanAllWhatsAppData() {
  try {
    console.log("🗑️  Starting clean up...\n");

    // Step 1: Delete all messages
    console.log("1. Deleting messages...");
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`   ✅ Deleted ${deletedMessages.count} messages\n`);

    // Step 2: Delete all conversations
    console.log("2. Deleting conversations...");
    const deletedConvs = await prisma.conversation.deleteMany({});
    console.log(`   ✅ Deleted ${deletedConvs.count} conversations\n`);

    // Step 3: Delete ONLY WhatsApp customer users (preserve ADMIN and AGENT users)
    console.log("3. Deleting WhatsApp customer users...");
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: { contains: "@whatsapp.user" },
        role: "USER",
      },
    });
    console.log(`   ✅ Deleted ${deletedUsers.count} customer users\n`);

    console.log("✅ CLEAN UP COMPLETED!");
    console.log(
      "Now you can test sending messages from mobile and they will be created fresh with correct names."
    );
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanAllWhatsAppData();
