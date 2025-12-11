/**
 * Delete conversations with incorrect "Desde Celular" subject
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanup() {
  try {
    console.log("🧹 Deleting incorrectly created conversations...\n");

    const result = await prisma.conversation.deleteMany({
      where: {
        subject: {
          contains: "Desde Celular",
        },
      },
    });

    console.log(`✅ Deleted ${result.count} conversations`);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();
