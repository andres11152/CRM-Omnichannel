import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@reply.com";
  console.log(`🔍 Checking role for user: ${email}`);
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    console.log(`✅ User found: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   CompanyId: ${user.companyId}`);
  } else {
    console.log("❌ User not found.");
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
