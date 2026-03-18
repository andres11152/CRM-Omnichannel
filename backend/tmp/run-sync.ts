import { PrismaClient } from "@prisma/client";
import { chatSyncService } from "../src/services/chatSyncService";
import { registerWhatsAppServices } from "../src/whatsapp/di/registration";

const prisma = new PrismaClient();

async function run() {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { status: "CONNECTED" },
  });
  if (sessions.length === 0) {
    console.log("No connected sessions.");
    return;
  }

  const companyId = sessions[0].companyId;

  // Find the conversation for 573242450628
  const conv = await prisma.conversation.findFirst({
    where: { channelId: "573242450628" },
  });

  if (!conv) {
    console.log("No conversation found for 573242450628");
    return;
  }

  console.log("Starting Context Sync for", conv.id);
  // We need to bypass activeContextSyncs lock in dev by manually calling the inner logic,
  // or just run it natively. The lock clears when finished.

  await chatSyncService.contextSync(companyId, conv.id, conv.channelId!);

  console.log("Done syncing");
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
