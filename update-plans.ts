import { prisma } from "./src/config/prisma";

async function updatePlans() {
  try {
    console.log("Updating plans with correct limits...");

    // Starter Plan
    const starter = await prisma.plan.upsert({
      where: { id: "plan_starter" },
      update: {
        name: "Starter",
        price: 29.99,
        config: {
          max_users: 3,
          max_whatsapp_sessions: 1,
          max_queues: 2,
          max_tickets_per_month: 100,
          max_ai_assistants: 1,
        },
      },
      create: {
        id: "plan_starter",
        name: "Starter",
        price: 29.99,
        config: {
          max_users: 3,
          max_whatsapp_sessions: 1,
          max_queues: 2,
          max_tickets_per_month: 100,
          max_ai_assistants: 1,
        },
      },
    });
    console.log("✅ Starter plan updated:", starter.name);

    // Pro Plan
    const pro = await prisma.plan.upsert({
      where: { id: "plan_pro" },
      update: {
        name: "Pro",
        price: 79.99,
        config: {
          max_users: 10,
          max_whatsapp_sessions: 3,
          max_queues: 5,
          max_tickets_per_month: 1000,
          max_ai_assistants: 3,
        },
      },
      create: {
        id: "plan_pro",
        name: "Pro",
        price: 79.99,
        config: {
          max_users: 10,
          max_whatsapp_sessions: 3,
          max_queues: 5,
          max_tickets_per_month: 1000,
          max_ai_assistants: 3,
        },
      },
    });
    console.log("✅ Pro plan updated:", pro.name);

    // Enterprise Plan
    const enterprise = await prisma.plan.upsert({
      where: { id: "plan_enterprise" },
      update: {
        name: "Enterprise",
        price: 199.99,
        config: {
          max_users: -1, // unlimited
          max_whatsapp_sessions: -1,
          max_queues: -1,
          max_tickets_per_month: -1,
          max_ai_assistants: -1,
        },
      },
      create: {
        id: "plan_enterprise",
        name: "Enterprise",
        price: 199.99,
        config: {
          max_users: -1,
          max_whatsapp_sessions: -1,
          max_queues: -1,
          max_tickets_per_month: -1,
          max_ai_assistants: -1,
        },
      },
    });
    console.log("✅ Enterprise plan updated:", enterprise.name);

    // Update company to use Pro plan
    const company = await prisma.company.findFirst({
      where: { slug: "empresa-demo" },
    });

    if (company) {
      await prisma.company.update({
        where: { id: company.id },
        data: { planId: "plan_pro" },
      });
      console.log(`✅ Company "${company.name}" assigned to Pro plan`);
    }

    console.log("\n🎉 All plans updated successfully!");
  } catch (error) {
    console.error("Error updating plans:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updatePlans();
