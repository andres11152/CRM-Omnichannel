import { prisma } from "../config/database";
import { TenantContextManager } from "../config/tenantContext";

async function main() {
  await TenantContextManager.runAsSystem(async () => {
    const message = await prisma.message.findUnique({
      where: { id: "cmpea2vah000peizqj9glmfq4" },
    });
    console.log("\n=== MESSAGE DETAIL ===");
    console.log(JSON.stringify(message, null, 2));
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
