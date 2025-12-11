import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function createMaster() {
  console.log("👑 Creating MASTER user...");

  const email = "master@reply.com";
  const password = "master123";

  // Check if user exists
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log("✅ Master user already exists:", {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      role: existing.role,
    });
    await prisma.$disconnect();
    return;
  }

  // Create MASTER user
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: "Master Admin",
      role: "MASTER",
      // MASTER doesn't need companyId
    },
  });

  console.log("✅ Master user created:", {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  console.log("\n🎉 You can now login with:");
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);

  await prisma.$disconnect();
}

createMaster().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
