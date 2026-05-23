import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  try {
    const ids = ["cmph46s8900jn3t9l2rsxr6jt", "cmph463wh002msx0yezfcj309"];
    
    console.log("Searching for conversations:", ids);
    for (const id of ids) {
      const conv = await prisma.conversation.findUnique({
        where: { id },
        include: {
          contact: true,
        }
      });
      console.log(`Conversation ${id}:`, JSON.stringify(conv, null, 2));
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
