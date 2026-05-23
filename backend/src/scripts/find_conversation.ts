import { prisma } from "../config/database";
import { runAsSystem } from "../context/requestContext";

async function run() {
  try {
    const convId = "cmpe716je002312aqvmzp2bes";
    const companyId = "88888888-8888-8888-8888-888888888888";
    
    await runAsSystem(async () => {
      console.log("Searching for conversation...");
      const conv = await prisma.conversation.findUnique({
        where: { id: convId }
      });
      console.log("Conversation by findUnique:", conv);

      const allConvs = await prisma.conversation.findMany({
        take: 10
      });
      console.log("All conversations (first 10):", allConvs.map(c => ({ id: c.id, companyId: c.companyId, channelId: c.channelId })));
    });

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
