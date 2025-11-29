const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkDB() {
  try {
    console.log("--- Checking DB ---");
    const companies = await prisma.company.findMany();
    console.log("Companies:", companies);

    const users = await prisma.user.findMany({ where: { role: "USER" } });
    console.log("Contacts (Users):", users);

    const conversations = await prisma.conversation.findMany({
      include: { messages: true },
    });
    console.log("Conversations:", JSON.stringify(conversations, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkDB();
