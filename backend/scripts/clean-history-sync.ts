/**
 * One-time cleanup script: Remove all messages that were inserted
 * by the buggy history_sync (all marked INBOUND with wrong senderId).
 * These will be re-ingested with correct direction after re-scan.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  try {
    // Count before delete
    const before = await prisma.message.count({
      where: {
        metadata: {
          path: ["origin"],
          equals: "history_sync",
        },
      },
    });

    console.log(`Found ${before} history_sync messages to clean up.`);

    if (before === 0) {
      console.log("Nothing to clean. Exiting.");
      return;
    }

    // Delete all history_sync messages
    const result = await prisma.message.deleteMany({
      where: {
        metadata: {
          path: ["origin"],
          equals: "history_sync",
        },
      },
    });

    console.log(`✅ Deleted ${result.count} corrupted history_sync messages.`);
    console.log(
      "Now restart the backend and re-scan WhatsApp QR to re-ingest with correct direction.",
    );
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
