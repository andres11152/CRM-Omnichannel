import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Connecting to database...");
    await prisma.$connect();
    console.log("Connected successfully.");

    const userCount = await prisma.user.count();
    console.log(`Found ${userCount} users.`);

    console.log("Checking Queues table...");
    try {
      const queueCount = await prisma.queue.count();
      console.log(`Found ${queueCount} queues.`);
    } catch (err) {
      console.error("Error querying Queue table:", err);
    }

    console.log("Checking Flows table...");
    try {
      const flowCount = await prisma.flow.count();
      console.log(`Found ${flowCount} flows.`);
    } catch (err) {
      console.error("Error querying Flow table:", err);
    }

    console.log("Prisma Client is working correctly.");
  } catch (e) {
    console.error("Error connecting to database:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
