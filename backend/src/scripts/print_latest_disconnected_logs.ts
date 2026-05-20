import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        entity: "WhatsAppSession",
        action: "DISCONNECTED"
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    });
    console.log("LATEST_DISCONNECTED_AUDIT_LOGS:", JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error("Error reading logs:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
