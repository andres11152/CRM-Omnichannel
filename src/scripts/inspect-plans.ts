import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminCompany = await prisma.company.findFirst({
    where: { users: { some: { email: "admin@reply.com" } } },
    include: { plan: true },
  });

  if (!adminCompany) {
    console.log("Company for admin@reply.com not found");
    return;
  }

  console.log("Company:", adminCompany.name);
  console.log("Plan:", adminCompany.plan?.name);
  console.log(
    "Plan Config:",
    JSON.stringify(adminCompany.plan?.config, null, 2)
  );

  // Check all plans
  const plans = await prisma.plan.findMany();
  console.log("\n--- ALL PLANS ---");
  plans.forEach((p) => {
    console.log(`Plan: ${p.name} (${p.id})`);
    console.log(`Config:`, JSON.stringify(p.config));
  });
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
