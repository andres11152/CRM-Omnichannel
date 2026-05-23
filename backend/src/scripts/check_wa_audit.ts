import { prisma } from "../config/database";
import { TenantContextManager } from "../config/tenantContext";

async function main() {
  await TenantContextManager.runAsSystem(async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        entity: "WhatsAppSession",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    console.log("\n=== ALL WHATSAPP SESSION AUDIT LOGS ===");
    console.log(JSON.stringify(logs, null, 2));
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
