import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const id = "cmijsybv800039c6uese5vasd";
  console.log(`🔍 Getting conversation ${id}...`);
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { participants: true },
  });

  if (!conversation) {
    console.log("❌ Conversation not found");
    return;
  }

  console.log(`Subject: ${conversation.subject}`);
  console.log(`Participants:`);
  conversation.participants.forEach((p) => {
    console.log(`  - Name: ${p.name}`);
    console.log(`    Email: ${p.email}`);
    console.log(`    Role: ${p.role}`);
    console.log(`    ID: ${p.id}`);
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
