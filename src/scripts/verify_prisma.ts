import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking Prisma Client keys...");
  console.log(Object.keys(prisma));

  if ((prisma as any).whatsAppSession) {
    console.log("✅ prisma.whatsAppSession exists!");
  } else {
    console.log("❌ prisma.whatsAppSession is UNDEFINED");
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
