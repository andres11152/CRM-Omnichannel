import { prisma } from "./src/config/database";

async function main() {
  console.log("Checking tickets...");
  const countTotal = await prisma.ticket.count();
  const countActive = await prisma.ticket.count({
    where: { deletedAt: null },
  });
  console.log(`Total Tickets in DB: ${countTotal}`);
  console.log(`Active Tickets (deletedAt: null): ${countActive}`);

  const sample = await prisma.ticket.findFirst({
    where: { deletedAt: null },
    select: { id: true, subject: true, deletedAt: true },
  });
  console.log("Sample Active:", sample);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
