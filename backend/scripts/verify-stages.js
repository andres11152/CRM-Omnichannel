const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function verify() {
  const stages = await prisma.stage.findMany({
    orderBy: { order: "asc" },
    include: { pipeline: { select: { name: true, companyId: true } } },
  });

  const lines = stages.map(
    (s) =>
      s.pipeline.name +
      " | order=" +
      s.order +
      " | " +
      s.name +
      " | " +
      s.color,
  );
  lines.forEach((l) => console.log(l));
  console.log("TOTAL: " + stages.length + " stages");
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
