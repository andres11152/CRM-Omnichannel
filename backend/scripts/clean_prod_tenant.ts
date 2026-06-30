import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import axios from "axios";
import { Logger } from "../src/utils/logger";

const targetEmail = "financierardc@gmail.com";
const GATEWAY_PROD_URL = "https://reply-whatsapp-gateway.onrender.com";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://fuse_db_dd9u_user:HbY52kmUO3s1MehrgWoVZOOT1Pd2ViRO@dpg-d4obfgc9c44c73fbro3g-a.oregon-postgres.render.com/fuse_db_dd9u?sslmode=require"
    }
  }
});

const redis = new Redis("rediss://red-d5tcv17gi27c73f4mlv0:BkoREMwe5LdKK9NExksIyvtuGaTb0w6c@oregon-keyvalue.render.com:6379");

async function main() {
  Logger.info(`🧹 Starting deep clean up for tenant: ${targetEmail} in Production...`);

  try {
    // 1. Find the user
    const user = await prisma.user.findUnique({
      where: { email: targetEmail }
    });

    if (!user) {
      Logger.error(`❌ User with email ${targetEmail} not found!`);
      return;
    }

    const { companyId } = user;
    Logger.info(`🎯 Found Tenant Company ID: ${companyId}`);

    // 2. Find WhatsApp Sessions
    const sessions = await prisma.whatsAppSession.findMany({
      where: { companyId }
    });
    const sessionIds = sessions.map(s => s.sessionId);
    Logger.info(`📱 Found ${sessions.length} sessions: ${JSON.stringify(sessionIds)}`);

    // 3. Terminate sessions on the Production WhatsApp Gateway to stop incoming socket events
    for (const sessionId of sessionIds) {
      try {
        Logger.info(`🔌 Terminating session ${sessionId} on Gateway...`);
        await axios.post(`${GATEWAY_PROD_URL}/sessions/terminate`, {
          sessionId,
          clearAuth: true
        }, { timeout: 5000 });
        Logger.info(`✅ Terminated session ${sessionId} successfully`);
      } catch (err: any) {
        Logger.warn(`⚠️ Failed to terminate session ${sessionId} on gateway: ${err.message}`);
      }
    }

    // 4. Clear database tables selectively by companyId
    
    // MessageReactions
    const delReactions = await prisma.messageReaction.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delReactions.count} message reactions`);

    // Messages
    const delMessages = await prisma.message.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delMessages.count} messages`);

    // Tickets
    const delTickets = await prisma.ticket.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delTickets.count} tickets`);

    // ContactFlowSession
    const delFlows = await prisma.contactFlowSession.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delFlows.count} contact flow sessions`);

    // Deals
    const delDeals = await prisma.deal.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delDeals.count} deals`);

    // Activities
    const delActivities = await prisma.activity.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delActivities.count} activities`);

    // Emails
    const delEmails = await prisma.email.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delEmails.count} emails`);

    // Conversations
    const delConversations = await prisma.conversation.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delConversations.count} conversations`);

    // Contacts
    const delContacts = await prisma.contact.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delContacts.count} contacts`);

    // WhatsAppCredentials
    if (sessionIds.length > 0) {
      const delCreds = await prisma.whatsAppCredential.deleteMany({
        where: { sessionId: { in: sessionIds } }
      });
      Logger.info(`✅ Deleted ${delCreds.count} WhatsApp credentials`);
    }

    // WhatsAppSessions
    const delSessions = await prisma.whatsAppSession.deleteMany({
      where: { companyId }
    });
    Logger.info(`✅ Deleted ${delSessions.count} WhatsApp sessions`);

    // 5. Redis Key Cleanup for the specific sessions
    if (sessionIds.length > 0) {
      Logger.info("🧹 Cleaning Redis keys for target sessions...");
      let deletedKeysCount = 0;
      for (const sessionId of sessionIds) {
        // Find keys starting with wa:store:${sessionId}:*
        const storeKeys = await redis.keys(`wa:store:${sessionId}:*`);
        if (storeKeys.length > 0) {
          await redis.del(...storeKeys);
          deletedKeysCount += storeKeys.length;
        }
        // Delete routing key
        const routeDeleted = await redis.del(`wa:session-route:${sessionId}`);
        if (routeDeleted) deletedKeysCount++;
      }
      Logger.info(`✅ ${deletedKeysCount} keys deleted from Redis`);
    } else {
      Logger.info("ℹ️ No Redis keys to clean (no sessions found)");
    }

    Logger.info("✨ DEEP PRODUCTION CLEAN COMPLETED SUCCESSFULY.");
  } catch (err) {
    Logger.error("❌ Error running cleanup:", err);
  } finally {
    await prisma.$disconnect();
    redis.quit();
    process.exit(0);
  }
}

main();
