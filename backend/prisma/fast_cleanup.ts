import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log(
    "⚡ Starting Fast CRM Cleanup (Messages/Conversations/Tickets/WhatsApp)...",
  );

  const models = [
    "messageReaction",
    "message",
    "ticket",
    "whatsAppSession",
    "whatsAppCredential",
    "conversation",
  ];

  for (const model of models) {
    try {
      // @ts-ignore
      if (prisma[model]) {
        // @ts-ignore
        const result = await prisma[model].deleteMany({});
        console.log(`✅ Cleared ${model} (${result.count} records)`);
      }
    } catch (err: any) {
      console.warn(`⚠️ Error on ${model}: ${err.message}`);
    }
  }

  console.log("\n✨ FAST CLEANUP COMPLETE!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
