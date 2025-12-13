import { prisma } from "../src/config/prisma";

async function cleanup() {
  console.log("🧹 Starting Cleanup for 'Ingrid Forero'...");

  try {
    // 1. Find Contact(s)
    const contacts = await prisma.contact.findMany({
      where: {
        name: { contains: "Ingrid Forero", mode: "insensitive" },
      },
    });

    console.log(`Found ${contacts.length} contacts matching 'Ingrid Forero'.`);

    for (const contact of contacts) {
      console.log(
        `Processing Contact: ${contact.name} (${contact.id}) - Phone: ${contact.phone}`
      );

      const phone = contact.phone;

      // 2. Find Conversations related to this phone (channelId)
      // Note: channelId might be just digits or JID.
      const conversations = await prisma.conversation.findMany({
        where: {
          OR: [{ channelId: phone }, { channelId: { contains: phone } }],
        },
      });

      console.log(
        `Found ${conversations.length} conversations for phone ${phone}.`
      );

      for (const conv of conversations) {
        console.log(`Deleting Conversation ${conv.id}...`);

        // Delete Messages
        await prisma.message.deleteMany({ where: { conversationId: conv.id } });
        console.log("  - Messages deleted.");

        // Delete Tickets
        await prisma.ticket.deleteMany({ where: { conversationId: conv.id } });
        console.log("  - Tickets deleted.");

        // Delete Conversation
        await prisma.conversation.delete({ where: { id: conv.id } });
        console.log("  - Conversation deleted.");
      }

      // 3. Delete user if exists
      if (phone) {
        const userEmail = `${phone}@whatsapp.user`;
        const user = await prisma.user.findFirst({
          where: { email: userEmail },
        });
        if (user) {
          console.log(`Deleting User ${user.id} (${user.email})...`);
          // Delete tickets created by this user?
          await prisma.ticket.deleteMany({ where: { createdById: user.id } });

          await prisma.user.delete({ where: { id: user.id } });
          console.log("  - User deleted.");
        }
      }

      // 4. Delete Contact
      await prisma.contact.delete({ where: { id: contact.id } });
      console.log(`✅ Contact ${contact.id} deleted.`);
    }
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    await prisma.$disconnect();
    console.log("Done.");
  }
}

cleanup();
