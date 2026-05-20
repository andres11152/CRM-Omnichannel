import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function run() {
  try {
    const sessions = await prisma.whatsAppSession.findMany({
      orderBy: { createdAt: "desc" }
    });
    console.log("SESSIONS_IN_DB:", JSON.stringify(sessions, null, 2));
  } catch (err) {
    console.error("Error querying sessions:", err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
