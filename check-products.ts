import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const media = await prisma.media.findMany({
    select: { id: true, originalName: true, url: true, type: true },
    take: 5,
  });
  console.log("Media files:", JSON.stringify(media, null, 2));
}

main().finally(() => prisma.$disconnect());
