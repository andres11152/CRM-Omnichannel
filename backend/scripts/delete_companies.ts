import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const slugs = ["prophunt", "skydrop"];
  console.log(`Deleting companies with slugs: ${slugs.join(", ")}`);

  for (const slug of slugs) {
    const company = await prisma.company.findUnique({
      where: { slug },
    });

    if (company) {
      console.log(`Found company ${company.name} (${company.id}). Deleting...`);

      // Deleting denormalized messages and sessions to prevent FK NoAction errors
      await prisma.message.deleteMany({
        where: { companyId: company.id },
      });
      await prisma.agentSession.deleteMany({
        where: { companyId: company.id },
      });

      // Now delete the company (will cascade delete remaining relations)
      await prisma.company.delete({
        where: { id: company.id },
      });
      console.log(`Deleted company ${company.name} successfully.`);
    } else {
      console.log(`Company with slug '${slug}' not found.`);
    }
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
