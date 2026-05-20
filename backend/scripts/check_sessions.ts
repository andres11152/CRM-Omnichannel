import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("Database URL:", process.env.DATABASE_URL);

  const sessions = await prisma.whatsAppSession.findMany();
  console.log(`\n=== WhatsApp Sessions (${sessions.length}) ===`);
  for (const s of sessions) {
    console.log(`SessionId: ${s.sessionId}`);
    console.log(`  CompanyId: ${s.companyId}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Phone: ${s.phone}`);
    console.log(`  QR Code: ${s.qrCode ? s.qrCode.substring(0, 30) + "..." : "null"}`);
    console.log(`  Created At: ${s.createdAt}`);
    console.log(`  Updated At: ${s.updatedAt}\n`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Error checking sessions:", err);
});
