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
      industry: "SOFTWARE",
      phone: "+1234567890",
      email: "admin@replycrm.com",
      website: "https://reply.software",
      address: "San Francisco, CA",
      city: "San Francisco",
      state: "CA",
      country: "USA",
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
      role: "SUPER_ADMIN",
      companyId: superAdminCompany.id,
      isActive: true,
    },
  });

  console.log(
    `✅ Created super admin: ${superAdmin.email} / password: admin123`
  );

  // 3. CREATE DEMO COMPANY
  const demoCompany = await prisma.company.upsert({
    where: { slug: "demo-company" },
    update: {},
    create: {
      name: "Demo Company",
      slug: "demo-company",
      industry: "RETAIL",
      phone: "+1234567891",
      email: "demo@replycrm.com",
      website: "https://democompany.com",
      address: "123 Demo Street",
      city: "New York",
      state: "NY",
      country: "USA",
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
      isActive: true,
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
      isActive: true,
    },
  });

  console.log(`✅ Created demo agent: ${agent.email} / password: agent123`);

  // 6. CREATE DEMO PIPELINE
  const pipeline = await prisma.pipeline.upsert({
    where: {
      companyId_name: {
        companyId: demoCompany.id,
        name: "Sales Pipeline",
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
        pipelineId_name: {
          pipelineId: pipeline.id,
          name: stageData.name,
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
  const queue = await prisma.queue.upsert({
    where: {
      companyId_name: {
        companyId: demoCompany.id,
        name: "General Support",
      },
    },
    update: {},
    create: {
      name: "General Support",
      description: "Default support queue",
      companyId: demoCompany.id,
      isDefault: true,
    },
  });

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
  console.log("=".repeat(50));
  console.log("LOGIN CREDENTIALS:");
  console.log("=".repeat(50));
  console.log("\n👤 Super Admin:");
  console.log("   Email: admin@replycrm.com");
  console.log("   Password: admin123");
  console.log("\n👤 Demo Admin:");
  console.log("   Email: demo@replycrm.com");
  console.log("   Password: demo123");
  console.log("\n👤 Demo Agent:");
  console.log("   Email: agent@replycrm.com");
  console.log("   Password: agent123");
  console.log("\n" + "=".repeat(50) + "\n");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
