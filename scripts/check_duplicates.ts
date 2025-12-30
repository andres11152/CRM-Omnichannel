import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkDuplicates() {
  console.log("Checking for duplicate conversations...");
  const conversations = await prisma.conversation.findMany({
    select: {
      id: true,
      channelId: true,
      companyId: true,
      subject: true,
      createdAt: true,
    },
    where: {
      channelId: { not: null },
    },
  });

  const grouped = new Map<string, typeof conversations>();

  for (const c of conversations) {
    if (!c.channelId) continue;
    const key = `${c.companyId}:${c.channelId}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(c);
  }

  let duplicateCount = 0;
  for (const [key, chats] of grouped.entries()) {
    if (chats.length > 1) {
      console.log(`\nDuplicate found for ${key}:`);
      chats.forEach((c) =>
        console.log(
          ` - ID: ${c.id} | Created: ${c.createdAt.toISOString()} | Subject: ${
            c.subject
          }`
        )
      );
      duplicateCount++;
    }
  }

  if (duplicateCount === 0) {
    console.log("\nNo duplicates found by [companyId, channelId].");
  } else {
    console.log(`\nFound ${duplicateCount} sets of duplicates.`);
  }
}

checkDuplicates()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
