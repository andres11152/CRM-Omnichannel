import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        entity: "WhatsAppSession"
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });
    console.log("WHATSAPP_AUDIT_LOGS:", JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error("Error reading logs:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
