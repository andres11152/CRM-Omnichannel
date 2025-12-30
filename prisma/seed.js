const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  try {
    // Limpiar datos existentes
    await prisma.user.deleteMany({});
    await prisma.company.deleteMany({});
    console.log("🧹 Cleaned existing data");

    // 1. CREATE SUPER ADMIN COMPANY (para administrar el SaaS)
    const adminCompany = await prisma.company.create({
      data: {
        name: "Reply SaaS Admin",
        slug: "reply-saas-admin",
        emailProvider: "SMTP",
      },
    });

    console.log(`✅ Created admin company: ${adminCompany.name}`);

    // 2. CREATE SUPER ADMIN USER (Panel de Administración SaaS)
    const adminHashedPassword = await bcrypt.hash("admin123", 10);

    const superAdmin = await prisma.user.create({
      data: {
        email: "admin@replycrm.com",
        name: "Super Admin",
        password: adminHashedPassword,
        role: "MASTER", // Rol máximo para administrar el SaaS
        companyId: adminCompany.id,
      },
    });

    console.log(
      `✅ Created MASTER ADMIN: ${superAdmin.email} / password: admin123`
    );

    // 3. CREATE DEMO COMPANY (Cliente del SaaS)
    const demoCompany = await prisma.company.create({
      data: {
        name: "Demo Company",
        slug: "demo-company",
        emailProvider: "SMTP",
        // 🔧 EMAIL CORPORATIVO (Multi-Tenant Fix)
        defaultSenderEmail: "contacto@democompany.com",
        defaultSenderName: "Demo Company",
      },
    });

    console.log(`✅ Created demo company: ${demoCompany.name}`);

    // 4. CREATE DEMO ADMIN (Usuario normal de un cliente)
    const demoHashedPassword = await bcrypt.hash("demo123", 10);

    const demoUser = await prisma.user.create({
      data: {
        email: "demo@replycrm.com",
        name: "Demo User",
        password: demoHashedPassword,
        role: "ADMIN",
        companyId: demoCompany.id,
      },
    });

    console.log(`✅ Created demo admin: ${demoUser.email} / password: demo123`);

    // 5. CREATE DEMO AGENT (Agente del cliente)
    const agentHashedPassword = await bcrypt.hash("agent123", 10);

    const agent = await prisma.user.create({
      data: {
        email: "agent@replycrm.com",
        name: "Demo Agent",
        password: agentHashedPassword,
        role: "AGENT",
        companyId: demoCompany.id,
      },
    });

    console.log(`✅ Created demo agent: ${agent.email} / password: agent123`);

    console.log("\n🎉 Database seeded successfully!\n");
    console.log("=".repeat(60));
    console.log("LOGIN CREDENTIALS:");
    console.log("=".repeat(60));
    console.log("\n🔴 MASTER ADMIN (Panel de Administración SaaS):");
    console.log("   Email: admin@replycrm.com");
    console.log("   Password: admin123");
    console.log("   Role: MASTER");
    console.log("   Company: Reply SaaS Admin");
    console.log("   Access: /admin (gestionar todas las empresas)");
    console.log("\n🟢 DEMO ADMIN (Cliente del SaaS):");
    console.log("   Email: demo@replycrm.com");
    console.log("   Password: demo123");
    console.log("   Role: ADMIN");
    console.log("   Company: Demo Company");
    console.log("   Access: Panel normal del CRM");
    console.log("\n🔵 DEMO AGENT (Agente del cliente):");
    console.log("   Email: agent@replycrm.com");
    console.log("   Password: agent123");
    console.log("   Role: AGENT");
    console.log("   Company: Demo Company");
    console.log("   Access: Panel de agente (limitado)");
    console.log("\n" + "=".repeat(60) + "\n");
  } catch (error) {
    console.error("❌ Error seeding database:");
    console.error("Message:", error.message);
    if (error.code) console.error("Code:", error.code);
    if (error.meta) console.error("Meta:", JSON.stringify(error.meta, null, 2));
    throw error;
  }
}

main()
  .then(() => {
    console.log("✅ Seed complete");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
