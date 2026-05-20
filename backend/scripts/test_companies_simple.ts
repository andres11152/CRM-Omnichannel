import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  console.log("🔍 Querying companies from DB directly...");
  const companies = await prisma.company.findMany({
    include: {
      plan: true,
      _count: { select: { users: true, tickets: true } }
    }
  });
  console.log(`Found ${companies.length} companies:`);
  for (const c of companies) {
    console.log(`- ID: ${c.id}, Name: ${c.name}, Slug: ${c.slug}, PlanId: ${c.planId}, PlanName: ${c.plan?.name || 'None'}`);
  }

  console.log("\n🔍 Querying plans from DB directly...");
  const plans = await prisma.plan.findMany();
  console.log(`Found ${plans.length} plans:`);
  for (const p of plans) {
    console.log(`- ID: ${p.id}, Name: ${p.name}, Price: ${p.price}`);
  }
}

run()
  .catch(err => console.error("Error:", err))
  .finally(() => prisma.$disconnect());
