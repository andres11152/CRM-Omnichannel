import { PrismaClient } from "@prisma/client";
import { Logger } from "../src/utils/logger";

const targetEmail = "financierardc@gmail.com";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://fuse_db_dd9u_user:HbY52kmUO3s1MehrgWoVZOOT1Pd2ViRO@dpg-d4obfgc9c44c73fbro3g-a.oregon-postgres.render.com/fuse_db_dd9u?sslmode=require"
    }
  }
});

async function main() {
  Logger.info(`🔍 Diagnosing database records for: ${targetEmail}...`);

  try {
    const user = await prisma.user.findUnique({
      where: { email: targetEmail }
    });

    if (!user) {
      Logger.error(`❌ User with email ${targetEmail} not found!`);
      return;
    }

    const { companyId } = user;
    Logger.info(`🎯 Tenant Company ID: ${companyId}`);

    const conversationsCount = await prisma.conversation.count({
      where: { companyId }
    });
    Logger.info(`💬 Remaining Conversations for this company: ${conversationsCount}`);

    const contactsCount = await prisma.contact.count({
      where: { companyId }
    });
    Logger.info(`👤 Remaining Contacts for this company: ${contactsCount}`);

    const messagesCount = await prisma.message.count({
      where: { companyId }
    });
    Logger.info(`✉️ Remaining Messages for this company: ${messagesCount}`);

    // If there are still conversations, let's see some details
    if (conversationsCount > 0) {
      const convs = await prisma.conversation.findMany({
        where: { companyId },
        take: 5,
        select: { id: true, subject: true, channelId: true }
      });
      Logger.info(`convs details: ${JSON.stringify(convs)}`);
    }

  } catch (err) {
    Logger.error("❌ Error running diagnosis:", err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
