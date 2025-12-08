import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { company: true },
  });

  console.log("--- ALL USERS ---");
  users.forEach((u) => {
    console.log(
      `User: ${u.email}, ID: ${u.id}, CompanyID: ${u.companyId}, CompanyName: ${u.company?.name}`
    );
  });

  const orphans = users.filter((u) => !u.companyId);
  if (orphans.length > 0) {
    console.log("\n--- ORPHAN USERS (No Company) ---");
    console.log("Likely cause of 400 error.");
  } else {
    console.log(
      "\nAll users have companies. The issue is likely the TOKEN cache in frontend."
    );
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
