import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const email = "admin@reply.com";
  const user = await prisma.user.findUnique({
    where: { email },
    include: { company: true },
  });

  if (!user) {
    console.log(`User ${email} not found.`);
    return;
  }

  console.log(`User: ${user.email}, ID: ${user.id}`);
  console.log(`Company ID: ${user.companyId}`);
  console.log(`Company Name: ${user.company?.name}`);

  if (!user.companyId) {
    console.warn("⚠️ User IS ORPHANED (No Company ID). Fixing now...");

    // Find 'Empresa Demo' or first company
    let company = await prisma.company.findFirst({
      where: { name: "Empresa Demo" },
    });

    if (!company) company = await prisma.company.findFirst();

    if (company) {
      await prisma.user.update({
        where: { email },
        data: { companyId: company.id },
      });
      console.log(`✅ Fixed! Assigned to ${company.name}`);
    } else {
      console.error("❌ Could not find a company to assign.");
    }
  } else {
    console.log("✅ User looks fine in DB.");
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
