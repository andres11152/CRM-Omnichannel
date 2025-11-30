const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Connecting...");
    await prisma.$connect();
    console.log("Connected.");

    console.log("Prisma keys:", Object.keys(prisma));

    // Check if testModel exists
    if (prisma.testModel) {
      console.log("prisma.testModel exists!");
    } else {
      console.log("prisma.testModel does NOT exist.");
    }

    if (prisma.queue) {
      console.log("prisma.queue exists!");
    } else {
      console.log("prisma.queue does NOT exist.");
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
