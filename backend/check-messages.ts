import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.message.count();
  console.log("Total messages:", count);
  const companyCounts = await prisma.message.groupBy({
    by: ["companyId"],
    _count: true,
  });
  console.log("Company messages counts:", companyCounts);
  await prisma.$disconnect();
}

main().catch(console.error);
