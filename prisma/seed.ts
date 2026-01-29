import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // 1. CREATE SUPER ADMIN COMPANY
  const superAdminCompany = await prisma.company.upsert({
    where: { slug: "reply-admin" },
    update: {},
    create: {
      name: "Reply CRM Admin",
      slug: "reply-admin",
      phone: "+1234567890",
      timezone: "America/Los_Angeles",
      settings: {
        whatsappEnabled: true,
        emailEnabled: true,
        smsEnabled: false,
      },
    },
  });

  console.log(`✅ Created company: ${superAdminCompany.name}`);

  // 2. CREATE SUPER ADMIN USER
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@replycrm.com" },
    update: {},
    create: {
      email: "admin@replycrm.com",
      name: "Super Admin",
      password: hashedPassword,
      role: "MASTER",
      companyId: superAdminCompany.id,
    },
  });

  console.log(
    `✅ Created super admin: ${superAdmin.email} / password: admin123`,
  );

  // 3. CREATE DEMO COMPANY
  const demoCompany = await prisma.company.upsert({
    where: { slug: "demo-company" },
    update: {},
    create: {
      name: "Demo Company",
      slug: "demo-company",
      phone: "+1234567891",
      timezone: "America/New_York",
      settings: {
        whatsappEnabled: true,
        emailEnabled: true,
        smsEnabled: false,
      },
    },
  });

  console.log(`✅ Created demo company: ${demoCompany.name}`);

  // 4. CREATE DEMO USER
  const demoDemoHashedPassword = await bcrypt.hash("demo123", 10);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@replycrm.com" },
    update: {},
    create: {
      email: "demo@replycrm.com",
      name: "Demo User",
      password: demoDemoHashedPassword,
      role: "ADMIN",
      companyId: demoCompany.id,
    },
  });

  console.log(`✅ Created demo user: ${demoUser.email} / password: demo123`);

  // 5. CREATE DEMO AGENT
  const agentPassword = await bcrypt.hash("agent123", 10);

  const agent = await prisma.user.upsert({
    where: { email: "agent@replycrm.com" },
    update: {},
    create: {
      email: "agent@replycrm.com",
      name: "Demo Agent",
      password: agentPassword,
      role: "AGENT",
      companyId: demoCompany.id,
    },
  });

  console.log(`✅ Created demo agent: ${agent.email} / password: agent123`);

  // 6. CREATE DEMO PIPELINE (Default only)
  const pipeline = await prisma.pipeline.upsert({
    where: {
      companyId_isDefault: {
        companyId: demoCompany.id,
        isDefault: true,
      },
    },
    update: {},
    create: {
      name: "Sales Pipeline",
      isDefault: true,
      companyId: demoCompany.id,
    },
  });

  console.log(`✅ Created pipeline: ${pipeline.name}`);

  // 7. CREATE DEMO STAGES
  const stages = [
    { name: "Lead", color: "#3B82F6", order: 1 },
    { name: "Qualified", color: "#10B981", order: 2 },
    { name: "Proposal", color: "#F59E0B", order: 3 },
    { name: "Negotiation", color: "#EF4444", order: 4 },
    { name: "Won", color: "#22C55E", order: 5 },
  ];

  for (const stageData of stages) {
    await prisma.stage.upsert({
      where: {
        pipelineId_order: {
          pipelineId: pipeline.id,
          order: stageData.order,
        },
      },
      update: {},
      create: {
        ...stageData,
        pipelineId: pipeline.id,
      },
    });
  }

  console.log(`✅ Created ${stages.length} stages`);

  // 8. CREATE DEMO QUEUE
  let queue = await prisma.queue.findFirst({
    where: {
      companyId: demoCompany.id,
      name: "General Support",
    },
  });

  if (!queue) {
    queue = await prisma.queue.create({
      data: {
        name: "General Support",
        description: "Default support queue",
        companyId: demoCompany.id,
      },
    });
  }

  console.log(`✅ Created queue: ${queue.name}`);

  // 9. CREATE DEMO CONTACT
  const contact = await prisma.contact.upsert({
    where: {
      companyId_phone: {
        companyId: demoCompany.id,
        phone: "+1234567890",
      },
    },
    update: {},
    create: {
      name: "John Doe",
      email: "john@example.com",
      phone: "+1234567890",
      companyId: demoCompany.id,
      tags: ["demo", "customer"],
    },
  });

  console.log(`✅ Created contact: ${contact.name}`);

  console.log("\n🎉 Database seeded successfully!\n");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
