import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Searching for 'Admin prueba' company...");
  const company = await prisma.company.findFirst({
    where: {
      name: {
        contains: "Admin prueba",
        mode: "insensitive",
      },
    },
  });

  if (!company) {
    console.error("Company 'Admin prueba' not found.");
    return;
  }
  console.log(`Found company: ${company.name} (${company.id})`);

  console.log("Searching for 'Pro' plan...");
  const plan = await prisma.plan.findFirst({
    where: {
      name: {
        contains: "Pro",
        mode: "insensitive",
      },
    },
  });

  if (!plan) {
    console.error("Plan 'Pro' not found.");
    // Fallback to list all plans
    const plans = await prisma.plan.findMany();
    console.log(
      "Available plans:",
      plans.map((p) => p.name)
    );
    return;
  }
  console.log(`Found plan: ${plan.name} (${plan.id})`);

  console.log(`Assigning plan ${plan.name} to company ${company.name}...`);
  await prisma.company.update({
    where: { id: company.id },
    data: { planId: plan.id },
  });

  console.log("Plan assigned successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
