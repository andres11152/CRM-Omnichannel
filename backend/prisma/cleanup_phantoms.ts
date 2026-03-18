import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Cleaning phantom WhatsApp users (LID artifacts)...");

  const phantomUsers = await prisma.user.deleteMany({
    where: {
      role: "USER",
      email: { endsWith: "@whatsapp.user" },
    },
  });
  console.log(`✅ Deleted ${phantomUsers.count} phantom whatsapp users`);

  const phantomContacts = await prisma.contact.deleteMany({});
  console.log(`✅ Deleted ${phantomContacts.count} phantom contacts`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
