import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const sessions = await prisma.whatsAppSession.findMany({
      include: {
        company: true,
      },
    });

    console.log("Found sessions:", sessions.length);
    for (const s of sessions) {
      console.log(`Session ID: ${s.sessionId}`);
      console.log(`Status: ${s.status}`);
      console.log(`Phone: ${s.phone}`);
      console.log(`Company: ${s.company.name} (${s.companyId})`);
      console.log("-------------------");
    }
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
