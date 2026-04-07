
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const companyId = "88888888-8888-8888-8888-888888888888";
  console.log(`🧹 Specific cleanup for ${companyId}`);
  
  const sessions = await prisma.whatsAppSession.findMany({
    where: { companyId }
  });

  console.log(`Found ${sessions.length} sessions.`);

  for (const s of sessions) {
    console.log(`- ID: ${s.sessionId}, Status: ${s.status}, Phone: ${s.phone}`);
    if (s.status !== "CONNECTED") {
      console.log(`  Deleting ghost: ${s.sessionId}`);
      await prisma.whatsAppSession.delete({ where: { id: s.id } });
    }
  }

  process.exit(0);
}

main();
