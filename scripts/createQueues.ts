import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // 1. Login (Simulated - we need a valid user to assign queues to, or just create them as system)
    // For this script, we'll assume we can create queues directly if we have DB access.
    // We need a companyId. Let's fetch the first company.

    const company = await prisma.company.findFirst();

    if (!company) {
      console.error("No company found. Please create a company first.");
      return;
    }

    const companyId = company.id;
    console.log(`Found company: ${company.name} (${companyId})`);

    const queuesToCreate = [
      { name: "Ventas", description: "Cola para consultas de ventas" },
      { name: "Soporte", description: "Cola para soporte técnico" },
      { name: "Facturación", description: "Cola para dudas de facturación" },
    ];

    for (const q of queuesToCreate) {
      const existing = await prisma.queue.findFirst({
        where: {
          name: q.name,
          companyId: companyId,
        },
      });

      if (existing) {
        console.log(`Queue '${q.name}' already exists.`);
      } else {
        await prisma.queue.create({
          data: {
            name: q.name,
            description: q.description,
            companyId: companyId,
          },
        });
        console.log(`Queue '${q.name}' created.`);
      }
    }

    console.log("Queue creation process finished.");
  } catch (error) {
    console.error("Error creating queues:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
