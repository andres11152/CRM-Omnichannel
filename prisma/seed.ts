import { PrismaClient, CompanyStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Robust Seeding...");

  // 1. Create the Company
  console.log("🏢 Creating Demo Company...");
  const demoCompany = await prisma.company.upsert({
    where: { id: "demo-company-id" },
    update: {},
    create: {
      id: "demo-company-id",
      name: "Reply CRM Demo",
      // Removed 'email' (doesn't exist on Company)
      // Removed 'plan' (is a relation)
      status: CompanyStatus.ACTIVE,
      settings: {
        theme: "light",
        language: "es",
        timezone: "America/Bogota",
      },
    },
  });

  // 2. Create Users linked to Company
  const passwordHash = await bcrypt.hash("admin123", 10);

  const users = [
    {
      email: "admin@replycrm.com",
      name: "Master Admin",
      role: UserRole.MASTER,
    },
    { email: "demo@replycrm.com", name: "Demo Admin", role: UserRole.ADMIN },
    { email: "agent1@replycrm.com", name: "Agent One", role: UserRole.AGENT },
    { email: "agent2@replycrm.com", name: "Agent Two", role: UserRole.AGENT },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { companyId: demoCompany.id },
      create: {
        email: u.email,
        name: u.name,
        password: passwordHash,
        role: u.role,
        companyId: demoCompany.id,
        preferences: { darkMode: true },
      },
    });
    console.log(`👤 Linked ${u.email} to ${demoCompany.name}`);
  }

  console.log("✅ Seeding Complete. System ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
