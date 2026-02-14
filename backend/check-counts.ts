import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.ticket.count();
  console.log("Total tickets:", count);
  const companyCounts = await prisma.ticket.groupBy({
    by: ["companyId"],
    _count: true,
  });
  console.log("Company counts:", companyCounts);
  await prisma.$disconnect();
}

main().catch(console.error);
