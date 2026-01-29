import { prisma } from "@/config/database";
import { whatsappService } from "@/whatsapp";
import { renderTemplate, componentsToText } from "./templateService";
import { getErrorMessage } from "@/utils/errorHelpers";
import { Logger } from "@/utils/logger";
import { MessageTemplate } from "@prisma/client";
import {
  TypedCampaign,
  CampaignStats,
  AudienceContact,
  AudienceFilter,
} from "@/interfaces/CampaignTypes";

/**
 * 🚀 CAMPAIGN EXECUTION ENGINE
 *
 * Intelligent campaign executor with:
 * - Template rendering support
 * - Human-like throttling (2-5s delays)
 * - Rate limit handling
 * - Retry logic
 * - Real-time metrics tracking
 */

// 🛡️ THROTTLING CONFIGURATION
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 5000;
const BATCH_UPDATE_SIZE = 10;
const RATE_LIMIT_PAUSE_MS = 60000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(): number {
  return (
    Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)) + MIN_DELAY_MS
  );
}

export const campaignService = {
  /**
   * Execute campaign with intelligent throttling and error handling
   */
  async executeCampaign(campaignId: string, companyId: string) {
    Logger.info(`[Campaign] Starting execution for ${campaignId}`);

    try {
      // 1. Fetch Campaign (Optimized Select)
      const rawCampaign = await prisma.campaign.findFirst({
        where: { id: campaignId, companyId },
        select: {
          id: true,
          companyId: true,
          name: true,
          status: true,
          templateId: true,
          targetTags: true,
          messageContent: true,
          stats: true,
          // Exclude bulky config/history if not needed
        },
      });

      if (!rawCampaign) {
        throw new Error("Campaign not found");
      }

      // Safe cast to typed interface
      const campaign: TypedCampaign = {
        ...rawCampaign,
        channel: "WHATSAPP", // Default inferred
        subject: null,
        createdById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        config: null,
        stats: rawCampaign.stats as unknown as CampaignStats | null,
      };

      if (campaign.status === "completed" || campaign.status === "failed") {
        Logger.info(
          `[Campaign] Campaign ${campaignId} already finished (${campaign.status})`,
        );
        return;
      }

      // 2. Fetch Template
      let template: MessageTemplate | null = null;
      if (campaign.templateId) {
        template = await prisma.messageTemplate.findFirst({
          where: { id: campaign.templateId, companyId },
        });

        if (!template) {
          Logger.warn(
            `[Campaign] Template ${campaign.templateId} not found, using messageContent`,
          );
        }
      }

      // 3. Fetch Audience
      const contacts = await this.getAudience(companyId, campaign.targetTags);

      Logger.info(`[Campaign] Audience size: ${contacts.length}`);

      if (contacts.length === 0) {
        const emptyStats: CampaignStats = {
          targetAudienceSize: 0,
          sent: 0,
          delivered: 0,
          failed: 0,
          skipped: 0,
          startedAt: new Date().toISOString(),
          message: "No contacts found for target tags",
        };

        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: "completed",
            stats: emptyStats as any,
          },
        });
        Logger.warn(`[Campaign] No contacts found for campaign ${campaignId}`);
        return;
      }

      // 4. Initialize Stats
      const stats: CampaignStats = {
        targetAudienceSize: contacts.length,
        sent: 0,
        delivered: 0,
        failed: 0,
        skipped: 0,
        startedAt: new Date().toISOString(),
      };

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "sending",
          stats: stats as any,
        },
      });

      // 5. Execute Campaign
      let consecutiveRateLimitErrors = 0;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];

        try {
          // Send message (Typed arguments)
          await this.sendCampaignMessage(
            contact,
            campaign,
            template,
            companyId,
            campaignId,
          );

          stats.sent++;
          consecutiveRateLimitErrors = 0;

          Logger.info(
            `[Campaign] Progress: ${stats.sent}/${
              contacts.length
            } (${Math.round((stats.sent / contacts.length) * 100)}%)`,
          );
        } catch (error: unknown) {
          const errorMsg = getErrorMessage(error);
          Logger.error(
            `[Campaign] Failed to send to ${contact.phone}: ${errorMsg}`,
          );

          stats.failed++;

          // Rate limit handling
          if (errorMsg.includes("429") || errorMsg.includes("rate limit")) {
            consecutiveRateLimitErrors++;

            if (consecutiveRateLimitErrors >= 3) {
              Logger.warn(
                `[Campaign] Rate limit detected. Pausing for ${
                  RATE_LIMIT_PAUSE_MS / 1000
                }s...`,
              );
              await sleep(RATE_LIMIT_PAUSE_MS);
              consecutiveRateLimitErrors = 0;
            }
          }
        }

        // Periodic DB Update
        if ((i + 1) % BATCH_UPDATE_SIZE === 0) {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { stats: stats as any },
          });
        }

        // Human-like delay
        if (i < contacts.length - 1) {
          const delay = getRandomDelay();
          await sleep(delay);
        }
      }

      // 6. Final Update
      const finalStats: CampaignStats = {
        ...stats,
        completedAt: new Date().toISOString(),
        successRate: ((stats.sent / contacts.length) * 100).toFixed(2) + "%",
      };

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: stats.failed > 0 && stats.sent === 0 ? "failed" : "completed",
          stats: finalStats as any,
        },
      });

      Logger.info(
        `[Campaign] ✅ Finished ${campaignId}: ${stats.sent} sent, ${stats.failed} failed`,
      );
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      Logger.error(`[Campaign] ❌ Critical Error: ${errorMsg}`);

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "failed",
          stats: {
            error: errorMsg,
            failedAt: new Date().toISOString(),
          } as any,
        },
      });
    }
  },

  /**
   * Get campaign audience based on target tags
   */
  async getAudience(
    companyId: string,
    targetTags: string[],
  ): Promise<AudienceContact[]> {
    const where: AudienceFilter = {
      companyId,
      phone: { not: null },
      deletedAt: null,
    };

    if (targetTags && targetTags.length > 0) {
      where.tags = {
        hasSome: targetTags,
      };
    }

    const contacts = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        customFields: true,
      },
    });

    // Map Prisma result to strict type (handle Json -> Record)
    return contacts.map((c) => ({
      ...c,
      customFields: (c.customFields as Record<string, any>) || {},
    }));
  },

  /**
   * Send individual campaign message with template support
   */
  async sendCampaignMessage(
    contact: AudienceContact,
    campaign: TypedCampaign,
    template: MessageTemplate | null,
    companyId: string,
    campaignId: string,
  ): Promise<void> {
    const phone = contact.phone;
    if (!phone) {
      throw new Error("Contact has no phone number");
    }

    let messageContent = campaign.messageContent || "Hola!";

    if (template) {
      try {
        const templateText = componentsToText(template.components as any);

        const parameters: Record<string, string> = {
          name: contact.name || "Cliente",
          email: contact.email || "",
          phone: contact.phone || "",
          ...(contact.customFields || {}),
        };

        messageContent = renderTemplate(templateText, parameters);

        Logger.info(
          `[Campaign] Rendered template "${template.name}" for ${contact.name}`,
        );
      } catch (error) {
        Logger.warn(
          `[Campaign] Template rendering failed: ${getErrorMessage(error)}`,
        );
      }
    }

    // Reuse existing conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        companyId,
        channelId: contact.phone,
      },
      select: { id: true }, // Optimization: Only select ID
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          companyId,
          channelId: contact.phone,
          status: "OPEN",
        },
      });
    }

    // Get System User for Campaigns
    // Optimization: Cache this ID in memory in future iterations
    let systemUser = await prisma.user.findFirst({
      where: { companyId, email: "campaigns@system.bot" },
      select: { id: true },
    });

    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: {
          email: "campaigns@system.bot",
          companyId,
          name: "Campaign System",
          role: "AGENT",
          password: await import("bcryptjs").then((b) => b.hash("system", 10)),
        },
      });
    }

    await whatsappService.sendMessage(phone, messageContent, {
      companyId,
      conversationId: conversation.id,
      senderId: systemUser.id,
      metadata: {
        campaignId,
        campaignName: campaign.name,
        isCampaignMessage: true,
        templateId: template?.id,
        templateName: template?.name,
      },
    });
  },
};
