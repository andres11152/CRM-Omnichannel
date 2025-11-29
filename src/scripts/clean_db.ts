import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Cleaning up database...");

  // Delete all messages
  const deletedMessages = await prisma.message.deleteMany({});
  console.log(`Deleted ${deletedMessages.count} messages.`);

  // Delete all conversations
  const deletedConversations = await prisma.conversation.deleteMany({});
  console.log(`Deleted ${deletedConversations.count} conversations.`);

  // Delete all users EXCEPT admin and master
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      NOT: {
        email: { in: ["admin@reply.com", "master@reply.com"] },
      },
    },
  });
  console.log(`Deleted ${deletedUsers.count} users (kept admins).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
