import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.message.count();
  console.log(`Total messages in DB: ${count}`);
  
  const heatmap = await prisma.$queryRaw`
    SELECT 
      EXTRACT(DOW FROM "createdAt")::int as day,
      EXTRACT(HOUR FROM "createdAt")::int as hour,
      COUNT(*)::int as value
    FROM messages
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
  console.log('Current Heatmap Data:', JSON.stringify(heatmap, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
