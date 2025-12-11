/**
 * Fix participant relationships in conversations
 * Ensures each conversation has the correct customer as participant
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixParticipants() {
  try {
    console.log("🔧 Fixing conversation participants...\n");

    // Get all conversations with WhatsApp channel
    const conversations = await prisma.conversation.findMany({
      where: {
        channelId: { not: null },
      },
      include: {
        participants: true,
      },
    });

    console.log(`Found ${conversations.length} conversations\n`);

    for (const conv of conversations) {
      const phone = conv.channelId;
      if (!phone) continue;

      // Find the CORRECT customer user by phone
      const correctCustomer = await prisma.user.findFirst({
        where: {
          email: `${phone}@whatsapp.user`,
        },
      });

      if (!correctCustomer) {
        console.log(`⚠️  No customer found for phone: ${phone}`);
        continue;
      }

      // Check if this customer is already a participant
      const isParticipant = conv.participants.some(
        (p) => p.id === correctCustomer.id
      );

      if (!isParticipant) {
        console.log(`Fixing conversation: ${conv.id}`);
        console.log(`  Channel: ${conv.channelId}`);
        console.log(
          `  Current participants: ${conv.participants
            .map((p) => p.name)
            .join(", ")}`
        );
        console.log(`  Adding correct participant: ${correctCustomer.name}`);

        // Remove all current participants and add the correct one
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            participants: {
              set: [{ id: correctCustomer.id }],
            },
          },
        });

        console.log(`  ✅ Fixed\n`);
      } else {
        console.log(
          `✓ Conversation ${conv.id} already has correct participant`
        );
      }
    }

    console.log("\n✅ All conversations fixed");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixParticipants();
