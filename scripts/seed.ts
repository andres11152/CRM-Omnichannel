/**
 * Database Seeder for Reply CRM
 *
 * Seeds the database with initial data:
 * - Plans
 * - Master admin user
 * - Demo company with pipeline and stages
 * - Demo agents and queues
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Default pipeline stages configuration
const DEFAULT_STAGES = [
  { name: "Nuevo", order: 0, color: "#3B82F6" }, // Blue
  { name: "Calificado", order: 1, color: "#8B5CF6" }, // Purple
  { name: "Propuesta", order: 2, color: "#F59E0B" }, // Amber
  { name: "Negociación", order: 3, color: "#EC4899" }, // Pink
  { name: "Ganado", order: 4, color: "#10B981" }, // Green
  { name: "Perdido", order: 5, color: "#EF4444" }, // Red
];

async function main() {
  console.log("🌱 Starting database seed...");

  // 1. Create Plans
  console.log("\n📋 Creating plans...");
  const starterPlan = await prisma.plan.upsert({
    where: { id: "starter" },
    update: {},
    create: {
      id: "starter",
      name: "Starter",
      price: 29.99,
      config: {
        max_users: 3,
        max_queues: 2,
        max_whatsapp_connections: 1,
        can_use_ai: false,
        can_remove_branding: false,
        can_use_api: false,
      },
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { id: "pro" },
    update: {},
    create: {
      id: "pro",
      name: "Pro",
      price: 79.99,
      config: {
        max_users: 10,
        max_queues: 5,
        max_whatsapp_connections: 3,
        can_use_ai: true,
        can_remove_branding: true,
        can_use_api: true,
      },
    },
  });

  const enterprisePlan = await prisma.plan.upsert({
    where: { id: "enterprise" },
    update: {},
    create: {
      id: "enterprise",
      name: "Enterprise",
      price: 199.99,
      config: {
        max_users: -1, // unlimited
        max_queues: -1,
        max_whatsapp_connections: -1,
        can_use_ai: true,
        can_remove_branding: true,
        can_use_api: true,
      },
    },
  });

  console.log("✅ Plans created");

  // 2. Create Master Admin User (no company)
  console.log("\n👤 Creating master admin...");
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const masterAdmin = await prisma.user.upsert({
    where: { email: "admin@replycrm.com" },
    update: {},
    create: {
      email: "admin@replycrm.com",
      password: hashedPassword,
      name: "Master Admin",
      role: "MASTER",
    },
  });

  console.log("✅ Master admin created");

  // 3. Create Demo Company
  console.log("\n🏢 Creating demo company...");
  const demoCompany = await prisma.company.upsert({
    where: { slug: "demo-company" },
    update: {},
    create: {
      name: "Demo Company",
      slug: "demo-company",
      planId: proPlan.id,
      status: "ACTIVE",
    },
  });

  console.log("✅ Demo company created");

  // 4. Create Default Pipeline for Demo Company
  console.log("\n🔄 Creating default sales pipeline...");

  let defaultPipeline = await prisma.pipeline.findFirst({
    where: {
      companyId: demoCompany.id,
      isDefault: true,
    },
  });

  if (!defaultPipeline) {
    defaultPipeline = await prisma.pipeline.create({
      data: {
        companyId: demoCompany.id,
        name: "Pipeline de Ventas",
        isDefault: true,
      },
    });

    // Create stages for the pipeline
    for (const stageConfig of DEFAULT_STAGES) {
      await prisma.stage.create({
        data: {
          pipelineId: defaultPipeline.id,
          name: stageConfig.name,
          order: stageConfig.order,
          color: stageConfig.color,
        },
      });
    }

    console.log(`✅ Created pipeline with ${DEFAULT_STAGES.length} stages`);
  } else {
    console.log("⏭️  Pipeline already exists");
  }

  // 5. Create Admin User for Demo Company
  console.log("\n👤 Creating demo admin user...");
  const demoAdmin = await prisma.user.upsert({
    where: { email: "demo@replycrm.com" },
    update: {},
    create: {
      email: "demo@replycrm.com",
      password: hashedPassword,
      name: "Demo Admin",
      role: "ADMIN",
      companyId: demoCompany.id,
    },
  });

  console.log("✅ Demo admin created");

  // 6. Create Demo Agents
  console.log("\n👥 Creating demo agents...");
  const agent1 = await prisma.user.upsert({
    where: { email: "agent1@replycrm.com" },
    update: {},
    create: {
      email: "agent1@replycrm.com",
      password: hashedPassword,
      name: "Agent One",
      role: "AGENT",
      companyId: demoCompany.id,
    },
  });

  const agent2 = await prisma.user.upsert({
    where: { email: "agent2@replycrm.com" },
    update: {},
    create: {
      email: "agent2@replycrm.com",
      password: hashedPassword,
      name: "Agent Two",
      role: "AGENT",
      companyId: demoCompany.id,
    },
  });

  console.log("✅ Agents created");

  // 7. Create Demo Department
  console.log("\n🏬 Creating demo department...");
  const salesDept = await prisma.department.upsert({
    where: {
      companyId_name: {
        companyId: demoCompany.id,
        name: "Sales",
      },
    },
    update: {},
    create: {
      companyId: demoCompany.id,
      name: "Sales",
    },
  });

  console.log("✅ Department created");

  // 8. Create Demo Queue
  console.log("\n📋 Creating demo queue...");
  const salesQueue = await prisma.queue.upsert({
    where: { id: "demo-sales-queue" },
    update: {},
    create: {
      id: "demo-sales-queue",
      name: "Sales Queue",
      description: "Main sales queue",
      companyId: demoCompany.id,
      departmentId: salesDept.id,
      type: "ROUND_ROBIN",
      agents: {
        connect: [{ id: agent1.id }, { id: agent2.id }],
      },
    },
  });

  console.log("✅ Queue created");

  // 9. Create Demo Tags
  console.log("\n🏷️  Creating demo tags...");
  await prisma.tag.upsert({
    where: {
      companyId_name: {
        companyId: demoCompany.id,
        name: "VIP",
      },
    },
    update: {},
    create: {
      companyId: demoCompany.id,
      name: "VIP",
      color: "#FFD700",
    },
  });

  await prisma.tag.upsert({
    where: {
      companyId_name: {
        companyId: demoCompany.id,
        name: "Urgente",
      },
    },
    update: {},
    create: {
      companyId: demoCompany.id,
      name: "Urgente",
      color: "#FF0000",
    },
  });

  console.log("✅ Tags created");

  console.log("\n🎉 Database seeded successfully!");
  console.log("\n📝 Login credentials:");
  console.log("   Master Admin: admin@replycrm.com / admin123");
  console.log("   Demo Admin:   demo@replycrm.com / admin123");
  console.log("   Agent 1:      agent1@replycrm.com / admin123");
  console.log("   Agent 2:      agent2@replycrm.com / admin123");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
