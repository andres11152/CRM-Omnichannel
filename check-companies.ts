import { prisma } from "./src/config/prisma";

async function checkAndCreateCompany() {
  try {
    // Check if there are any companies
    const companies = await prisma.company.findMany();
    console.log(`Found ${companies.length} companies in database`);

    if (companies.length === 0) {
      console.log("Creating test company...");

      // Create a test plan first
      const plan = await prisma.plan.upsert({
        where: { id: "plan_starter" },
        update: {},
        create: {
          id: "plan_starter",
          name: "Starter",
          price: 29.99,
          config: {
            max_users: 5,
            max_queues: 3,
            max_tickets: 100,
          },
        },
      });

      // Create a test company
      const company = await prisma.company.create({
        data: {
          name: "Empresa Demo",
          slug: "empresa-demo",
          status: "TRIAL",
          planId: plan.id,
          address: "123 Main St",
          phone: "+1234567890",
          website: "https://demo.com",
          timezone: "America/New_York",
        },
      });

      console.log("✅ Test company created:", company);
    } else {
      console.log("Companies found:");
      companies.forEach((c) => console.log(`  - ${c.name} (${c.slug})`));
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndCreateCompany();
