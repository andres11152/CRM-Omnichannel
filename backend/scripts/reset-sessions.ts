import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Starting Session Cleanup...");

  // 1. Delete all credentials (This forces re-auth)
  const creds = await prisma.whatsAppCredential.deleteMany({});
  console.log(`✅ Deleted ${creds.count} credential records.`);

  // 2. DELETE all sessions (Forces fresh QR scan)
  const sessions = await prisma.whatsAppSession.deleteMany({});
  console.log(`✅ Deleted ${sessions.count} sessions.`);

  console.log("✨ Cleanup complete. Please restart the backend server.");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
