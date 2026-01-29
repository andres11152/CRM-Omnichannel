import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanWhatsAppData() {
  try {
    console.log("🧹 Starting WhatsApp data cleanup...");

    // 1. Delete Messages
    console.log("📧 Deleting messages...");
    const messagesDeleted = await prisma.message.deleteMany({});
    console.log(`✅ Deleted ${messagesDeleted.count} messages`);

    // 2. Delete Conversations
    console.log("💬 Deleting conversations...");
    const conversationsDeleted = await prisma.conversation.deleteMany({});
    console.log(`✅ Deleted ${conversationsDeleted.count} conversations`);

    // 3. Delete Tickets
    console.log("🎫 Deleting tickets...");
    const ticketsDeleted = await prisma.ticket.deleteMany({});
    console.log(`✅ Deleted ${ticketsDeleted.count} tickets`);

    // 4. Delete WhatsApp Credentials
    console.log("🔑 Deleting WhatsApp credentials...");
    const credsDeleted = await prisma.whatsAppCredential.deleteMany({});
    console.log(`✅ Deleted ${credsDeleted.count} credentials`);

    // 5. Delete WhatsApp Sessions
    console.log("📱 Deleting WhatsApp sessions...");
    const sessionsDeleted = await prisma.whatsAppSession.deleteMany({});
    console.log(`✅ Deleted ${sessionsDeleted.count} sessions`);

    console.log("\n✨ WhatsApp data cleanup completed successfully!");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanWhatsAppData()
  .then(() => {
    console.log("👋 Cleanup script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Cleanup script failed:", error);
    process.exit(1);
  });
