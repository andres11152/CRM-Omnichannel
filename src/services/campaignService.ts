import { prisma } from "@/config/prisma";
import { whatsappService } from "./whatsapp.service";
import { messageProcessor } from "./messageProcessor.service";
import { getErrorMessage } from "@/utils/errorHelpers";
import { Logger } from "@/utils/logger";

// 🛡️ RATE LIMITING CONFIGURATION
// WhatsApp typically allows ~60 messages/hour per phone for marketing
// We'll be more conservative: 10 concurrent sends max, with delays
const MAX_CONCURRENT_SENDS = 10; // Max parallel sends
const MIN_DELAY_MS = 2000; // 2 seconds minimum between sends
const MAX_DELAY_MS = 5000; // 5 seconds maximum between sends
const BATCH_UPDATE_SIZE = 10; // Update DB every N messages

/**
 * Service to handle Campaign Execution
 * ✅ Implements rate limiting to prevent WhatsApp bans
 * ✅ Concurrency control with p-limit pattern
 * ✅ Batch database updates for performance
 */
export const campaignService = {
  async executeCampaign(campaignId: string, companyId: string) {
    Logger.info(`[Campaign] Starting execution for ${campaignId}`);

    try {
      // 1. Fetch Campaign Details
      const campaignRaw = await prisma.$queryRaw<any[]>`
        SELECT * FROM campaigns WHERE id = ${campaignId} AND "companyId" = ${companyId}
      `;
      const campaign = campaignRaw[0];

      if (!campaign) throw new Error("Campaign not found");
      if (campaign.status === "completed" || campaign.status === "failed") {
        Logger.info(`[Campaign] Campaign ${campaignId} already finished.`);
        return;
      }

      // 2. Fetch Audience based on Tags
      let contacts: any[] = [];

      if (campaign.targetTags && campaign.targetTags.length > 0) {
        contacts = await prisma.$queryRaw<any[]>`
             SELECT * FROM contacts 
             WHERE "companyId" = ${companyId} 
             AND tags && ${campaign.targetTags}::text[]
           `;
      } else {
        contacts = await prisma.$queryRaw<any[]>`
             SELECT * FROM contacts WHERE "companyId" = ${companyId} AND phone IS NOT NULL
          `;
      }

      Logger.info(`[Campaign] Audience size: ${contacts.length}`);

      // Update initial stats
      const stats = {
        targetAudienceSize: contacts.length,
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        failed: 0,
      };

      await prisma.$executeRaw`
        UPDATE campaigns SET stats = ${JSON.stringify(
          stats
        )}::jsonb, status = 'running' WHERE id = ${campaignId}
      `;

      // 3. 🛡️ RATE-LIMITED PARALLEL EXECUTION
      // Use manual concurrency control (p-limit pattern)
      let activePromises = new Set<Promise<void>>();
      let completedCount = 0;

      for (const contact of contacts) {
        // Wait if we've hit max concurrency
        while (activePromises.size >= MAX_CONCURRENT_SENDS) {
          await Promise.race(activePromises);
        }

        // Create send promise
        const sendPromise = this.sendCampaignMessage(
          contact,
          campaign,
          companyId,
          campaignId
        )
          .then(() => {
            stats.sent++;
            completedCount++;

            // Batch update database
            if (completedCount % BATCH_UPDATE_SIZE === 0) {
              return prisma.$executeRaw`
                UPDATE campaigns SET stats = ${JSON.stringify(
                  stats
                )}::jsonb WHERE id = ${campaignId}
              `;
            }
          })
          .catch((error: unknown) => {
            const errorMsg = getErrorMessage(error);
            Logger.error(
              `[Campaign] Failed to send to ${contact.phone}:`,
              errorMsg
            );
            stats.failed++;
          })
          .finally(() => {
            activePromises.delete(sendPromise);
          });

        activePromises.add(sendPromise);

        // Random delay to simulate human behavior
        const delay =
          Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)) +
          MIN_DELAY_MS;
        await new Promise((r) => setTimeout(r, delay));
      }

      // Wait for all remaining sends to complete
      await Promise.all(activePromises);

      // 4. Final update
      await prisma.$executeRaw`
        UPDATE campaigns 
        SET status = 'completed', stats = ${JSON.stringify(stats)}::jsonb 
        WHERE id = ${campaignId}
      `;

      Logger.info(
        `[Campaign] Finished ${campaignId}: ${stats.sent} sent, ${stats.failed} failed`
      );
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      Logger.error(`[Campaign] Critical Error:`, errorMsg);
      await prisma.$executeRaw`
        UPDATE campaigns SET status = 'failed' WHERE id = ${campaignId}
       `;
    }
  },

  /**
   * 🛡️ Send individual campaign message with full error handling
   */
  async sendCampaignMessage(
    contact: any,
    campaign: any,
    companyId: string,
    campaignId: string
  ): Promise<void> {
    const phone = contact.phone;
    if (!phone) {
      throw new Error("Contact has no phone number");
    }

    const remoteJid = `${phone}@s.whatsapp.net`;
    const content = campaign.messageContent || "Hola!";

    // Use messageProcessor to ensure it's logged in DB
    await messageProcessor.process({
      companyId,
      sessionId: "campaign_worker",
      remoteJid,
      text: content,
      isOutbound: true,
      senderName: "Campaign Bot",
    });

    // Find or create conversation
    const conversation = await prisma.conversation.findFirst({
      where: { companyId, channelId: contact.phone },
    });

    // Get or create system user
    let systemUser = await prisma.user.findFirst({
      where: { email: "system@campaign.bot", companyId },
    });

    if (!systemUser && conversation) {
      systemUser = await prisma.user.create({
        data: {
          email: "system@campaign.bot",
          companyId,
          name: "Campaign Bot",
          role: "AGENT",
          password: "dummy",
        },
      });
    }

    // Send via WhatsApp
    if (conversation && systemUser) {
      await whatsappService.sendMessage(contact.phone, content, {
        companyId,
        conversationId: conversation.id,
        senderId: systemUser.id,
        metadata: {
          campaignId,
          isCampaignMessage: true,
        },
      });
    }
  },
};
