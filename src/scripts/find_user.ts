import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const phone = "573138081081";
  const email = `${phone}@whatsapp.user`;
  console.log(`🔍 Looking for user with email: ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { conversations: true },
  });

  if (user) {
    console.log(`✅ Found user: ${user.name} (${user.id})`);
    console.log(`  Conversations: ${user.conversations.length}`);
    user.conversations.forEach((c) =>
      console.log(`    - ${c.id}: ${c.subject}`)
    );
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
