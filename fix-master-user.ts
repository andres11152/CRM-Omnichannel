import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const email = "master@reply.com";
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.log(`User ${email} not found.`);
    return;
  }

  if (user.companyId) {
    console.log(`User ${email} already has Company ID: ${user.companyId}`);
    return;
  }

  console.log(`User ${email} is orphaned. Finding a company...`);

  // Find 'Empresa Demo' or first company
  let company = await prisma.company.findFirst({
    where: { name: "Empresa Demo" },
  });

  if (!company) {
    console.log("Empresa Demo not found, picking the first one...");
    company = await prisma.company.findFirst();
  }

  if (!company) {
    console.log("No companies existing! Creating one...");
    company = await prisma.company.create({
      data: {
        name: "Empresa Demo",
        planId: "pro", // defaulting
        status: "ACTIVE",
      },
    });
  }

  console.log(`Assigning ${email} to Company: ${company.name} (${company.id})`);

  await prisma.user.update({
    where: { email },
    data: { companyId: company.id },
  });

  console.log("✅ User fixed. Please re-login on frontend.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
