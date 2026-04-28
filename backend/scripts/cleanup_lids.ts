import { connectDB, prisma } from "../src/config/database";
import { WhatsAppIdUtils } from "../src/whatsapp/utils/WhatsAppIdUtils";
import { TenantContextManager } from "../src/config/tenantContext";

async function run() {
  console.log("Connecting DB...");
  await connectDB();
  console.log("Fetching contacts...");
  const contacts = await TenantContextManager.runAsSystem(async () => prisma.contact.findMany());
  let deleted = 0;
  for (const c of contacts) {
    if (c.phone && WhatsAppIdUtils.isLid(c.phone)) {
      await TenantContextManager.runAsSystem(async () => prisma.contact.delete({ where: { id: c.id } }));
      deleted++;
    }
  }
  console.log(`Cleaned up ${deleted} polluted LID contacts from CRM database.`);
  process.exit(0);
}
run();
