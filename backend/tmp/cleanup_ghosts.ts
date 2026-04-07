
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Looking for ghost CONNECTING sessions...");
  
  // Actually, I'll just delete any session with status CONNECTING for company 88888888-8888-8888-8888-888888888888
  // since the manual fix is needed now.
  const deleted = await prisma.whatsAppSession.deleteMany({
    where: {
      companyId: "88888888-8888-8888-8888-888888888888",
      status: "CONNECTING"
    }
  });

  console.log(`✅ Deleted ${deleted.count} ghost sessions.`);
  process.exit(0);
}

main();
