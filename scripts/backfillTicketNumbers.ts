import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfillTicketNumbers() {
  console.log("🔄 Backfilling ticketNumbers for existing tickets...");

  // Get all companies
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });

  for (const company of companies) {
    console.log(`\n📊 Processing company: ${company.name}`);

    // Get all tickets for this company, sorted by creation date
    const tickets = await prisma.ticket.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, subject: true },
    });

    console.log(`  Found ${tickets.length} tickets`);

    // Update each ticket with sequential number
    for (let i = 0; i < tickets.length; i++) {
      const ticketNumber = i + 1;
      await prisma.ticket.update({
        where: { id: tickets[i].id },
        data: { ticketNumber },
      });
      console.log(`  ✅ Ticket #${ticketNumber}: ${tickets[i].subject}`);
    }
  }

  console.log("\n✨ Backfill completed!");
  await prisma.$disconnect();
}

backfillTicketNumbers().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
