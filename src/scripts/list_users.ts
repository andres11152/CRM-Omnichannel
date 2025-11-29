import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Listing all users...");
  const users = await prisma.user.findMany({
    include: { company: true },
  });

  users.forEach((u) => {
    console.log(
      `User: ${u.name}, Email: ${u.email}, Role: ${u.role}, Company: ${u.company?.name}`
    );
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
