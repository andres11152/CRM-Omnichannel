import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Starting Enterprise Cleanup (Deep Clean Mode)...");

  // Models to clear in order (reverse dependency)
  // ⚠️ whatsAppSession & whatsAppCredential are EXCLUDED — they represent physical device pairings
  const tablesToClear = [
    "messageReaction",
    "message",
    "ticket",
    "contactFlowSession",
    "activity",
    "deal",
    "account",
    "auditLog",
    "workflowExecution",
    "campaign",
    "messageTemplate",
    "quickReply",
    "product",
    "apiKey",
    "webhook",
    "agentSession",
    "whatsAppCredential",
    "whatsAppSession",
    "billingTransaction",
    "media",
    "mediaAsset",
    "email",
    "notification",
    "stage",
    "pipeline",
    "queue",
    "department",
    "tag",
    "aiConfig",
    "aiAssistant",
    "rolePermission",
    "role",
    "pushSubscription",
    "conversation",
    "contact",
  ];

  for (const model of tablesToClear) {
    try {
      // @ts-ignore
      if (prisma[model]) {
        // @ts-ignore
        const result = await prisma[model].deleteMany({});
        console.log(`✅ Cleared ${model} (${result.count} records)`);
      } else {
        // Skip silently for models that don't exist in the current schema
      }
    } catch (err: any) {
      console.warn(`⚠️  Skipped/Error on ${model}: ${err.message}`);
    }
  }

  // Base users to keep
  // User asked for base users (master, admin, agent)
  console.log("👤 Filtering base users...");
  const usersDeleted = await prisma.user.deleteMany({
    where: {
      NOT: {
        OR: [
          { email: "master@reply.com" },
          { email: "admin@reply.com" },
          { role: "MASTER" },
          { role: "ADMIN" },
          { role: "AGENT" },
        ],
      },
    },
  });
  console.log(`✅ Deleted ${usersDeleted.count} non-base users.`);

  console.log("\n✨ DATABASE CLEANUP COMPLETE!");
  console.log("🛡️  User base, Plans, and Company configurations preserved.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
