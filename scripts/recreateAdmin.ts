import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function recreateAdmin() {
  console.log("🔧 Recreating admin user...");

  const email = "admin@reply.com";
  const password = "password123";

  // Check if user exists
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { company: true },
  });

  if (existing) {
    console.log("✅ User already exists:", {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      company: existing.company?.name,
    });
    await prisma.$disconnect();
    return;
  }

  // Find or create company
  let company = await prisma.company.findFirst();

  if (!company) {
    console.log("📦 Creating company...");
    company = await prisma.company.create({
      data: {
        name: "Reply CRM",
        slug: "reply-crm",
        status: "ACTIVE",
      },
    });
  }

  // Create admin user
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: "Admin",
      role: "ADMIN",
      companyId: company.id,
    },
  });

  console.log("✅ Admin user created:", {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
  });

  // Create MASTER user (no company needed)
  const masterEmail = "master@reply.com";
  const masterPassword = "master123";
  const masterHashedPassword = await bcrypt.hash(masterPassword, 10);

  const masterUser = await prisma.user.create({
    data: {
      email: masterEmail,
      password: masterHashedPassword,
      name: "Master Admin",
      role: "MASTER",
      // MASTER doesn't need companyId
    },
  });

  console.log("\n✅ Master user created:", {
    id: masterUser.id,
    email: masterUser.email,
    name: masterUser.name,
    role: masterUser.role,
  });

  console.log("\n🎉 You can now login with:");
  console.log("\n📧 ADMIN:");
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log("\n👑 MASTER:");
  console.log(`   Email: ${masterEmail}`);
  console.log(`   Password: ${masterPassword}`);

  await prisma.$disconnect();
}

recreateAdmin().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
