import { prisma } from "../config/database";
import { TenantContextManager } from "../config/tenantContext";

async function main() {
  await TenantContextManager.runAsSystem(async () => {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    console.log("\n=== AUDIT LOGS ===");
    console.log(JSON.stringify(logs, null, 2));
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
