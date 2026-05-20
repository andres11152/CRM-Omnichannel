import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
  });

  try {
    const sessions = await prisma.whatsAppSession.findMany();
    console.log("\n=== DIRECT SESSIONS ===");
    console.log(JSON.stringify(sessions, null, 2));

    const credentials = await prisma.whatsAppCredential.findMany({
      select: {
        id: true,
        sessionId: true,
        key: true,
      },
    });
    console.log("\n=== DIRECT CREDENTIALS COUNT ===");
    console.log("Credentials Count:", credentials.length);
    console.log("Sample Credentials:", JSON.stringify(credentials.slice(0, 5), null, 2));

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
