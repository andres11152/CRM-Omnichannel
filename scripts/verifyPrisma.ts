import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking User model...");
  try {
    const userCount = await prisma.user.count();
    console.log(`✅ User count: ${userCount}`);
  } catch (e) {
    console.error("❌ User model failed:", e);
  }

  console.log("Checking Queue model...");
  try {
    if (!prisma.queue) {
      throw new Error("prisma.queue is undefined");
    }
    const queueCount = await prisma.queue.count();
    console.log(`✅ Queue count: ${queueCount}`);
  } catch (e) {
    console.error("❌ Queue model failed:", e);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
