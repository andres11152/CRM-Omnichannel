import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Connecting...");
    await prisma.$connect();
    console.log("Connected.");

    console.log("Querying flows table...");
    const flows = await prisma.$queryRaw`SELECT * FROM flows`;
    console.log("Flows:", flows);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
