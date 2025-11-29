import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Checking for existing companies...");
  let company = await prisma.company.findFirst();

  if (!company) {
    console.log("⚠️ No company found. Creating default company...");
    company = await prisma.company.create({
      data: {
        name: "Reply Demo Company",
        slug: "reply-demo",
        status: "ACTIVE",
        isActive: true,
      },
    });
    console.log("✅ Created company:", company.id);
  } else {
    console.log("✅ Found existing company:", company.id, company.name);
  }

  const email = "admin@reply.com";
  console.log(`🔍 Finding user ${email}...`);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error("❌ User not found!");
    return;
  }

  console.log(
    `👤 User found: ${user.id}, Role: ${user.role}, Current CompanyId: ${user.companyId}`
  );

  if (!user.companyId) {
    console.log("🛠️ Updating user with company ID...");
    await prisma.user.update({
      where: { id: user.id },
      data: { companyId: company.id },
    });
    console.log("✅ User updated successfully!");
  } else {
    console.log("ℹ️ User already has a company ID.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
