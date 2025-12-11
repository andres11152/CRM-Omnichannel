/**
 * Script to clean up duplicate "Skycode Agency" conversations
 * This removes conversations that were incorrectly created when sending messages from mobile
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupDuplicateChats() {
  try {
    console.log("🧹 Starting cleanup of duplicate Skycode Agency chats...");

    // Find all conversations with "Skycode Agency" in the subject
    const duplicateConversations = await prisma.conversation.findMany({
      where: {
        subject: {
          contains: "Skycode Agency",
        },
      },
      include: {
        messages: {
          select: { id: true },
        },
      },
    });

    console.log(
      `Found ${duplicateConversations.length} duplicate conversations`
    );

    if (duplicateConversations.length === 0) {
      console.log("✅ No duplicate conversations found. Database is clean!");
      return;
    }

    // Delete each conversation (Prisma will cascade delete messages)
    for (const conv of duplicateConversations) {
      console.log(
        `Deleting conversation: ${conv.id} - "${conv.subject}" (${conv.messages.length} messages)`
      );

      await prisma.conversation.delete({
        where: { id: conv.id },
      });
    }

    console.log(
      `✅ Successfully deleted ${duplicateConversations.length} duplicate conversations`
    );
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupDuplicateChats();
