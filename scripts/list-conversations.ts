/**
 * Script to list all conversations and identify duplicates
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function listAllConversations() {
  try {
    console.log("📋 Listing all conversations...\n");

    const conversations = await prisma.conversation.findMany({
      include: {
        participants: {
          select: {
            name: true,
            email: true,
          },
        },
        messages: {
          select: { id: true },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20, // Last 20 conversations
    });

    console.log(`Found ${conversations.length} conversations:\n`);

    for (const conv of conversations) {
      console.log(`ID: ${conv.id}`);
      console.log(`Subject: ${conv.subject}`);
      console.log(`ChannelId: ${conv.channelId}`);
      console.log(`Status: ${conv.status}`);
      console.log(
        `Participants: ${conv.participants
          .map((p) => p.name || p.email)
          .join(", ")}`
      );
      console.log(`Messages: ${conv.messages.length}`);
      console.log(`Created: ${conv.createdAt}`);
      console.log("---\n");
    }

    // Find potential duplicates by channelId
    const duplicates = conversations.reduce((acc, conv) => {
      if (conv.channelId) {
        if (!acc[conv.channelId]) {
          acc[conv.channelId] = [];
        }
        acc[conv.channelId].push(conv);
      }
      return acc;
    }, {} as Record<string, typeof conversations>);

    const duplicateGroups = Object.entries(duplicates).filter(
      ([_, convs]) => convs.length > 1
    );

    if (duplicateGroups.length > 0) {
      console.log("\n🔍 FOUND DUPLICATES:\n");
      for (const [channelId, convs] of duplicateGroups) {
        console.log(`Channel: ${channelId}`);
        for (const conv of convs) {
          console.log(`  - ${conv.id}: "${conv.subject}"`);
        }
        console.log("");
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

listAllConversations();
