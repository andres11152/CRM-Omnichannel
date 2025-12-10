const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  try {
    const latestConv = await prisma.conversation.findFirst({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 3,
          orderBy: { createdAt: "desc" },
          include: { sender: true },
        },
      },
    });

    if (latestConv) {
      latestConv.messages.reverse().forEach((m) => {
        console.log(`MSG ID: ${m.id}`);
        console.log(`Metadata: ${JSON.stringify(m.metadata, null, 2)}`);
      });
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
