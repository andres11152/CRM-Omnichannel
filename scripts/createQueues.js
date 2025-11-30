const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
console.log("Prisma keys:", Object.keys(prisma));
async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("No company found. Please create a company first.");
    return;
  }

  const queues = [
    { name: "Ventas", department: "Sales" },
    { name: "Soporte", department: "Support" },
    { name: "Facturación", department: "Billing" },
  ];

  for (const q of queues) {
    const existing = await prisma.queue.findFirst({
      where: { name: q.name, companyId: company.id },
    });

    if (!existing) {
      await prisma.queue.create({
        data: {
          name: q.name,
          description: `Cola para ${q.department}`,
          companyId: company.id,
        },
      });
      console.log(`Created queue: ${q.name}`);
    } else {
      console.log(`Queue already exists: ${q.name}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
