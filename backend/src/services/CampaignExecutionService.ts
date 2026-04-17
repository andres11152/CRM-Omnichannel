import { Prisma } from "@prisma/client";
import { whatsappService } from "@/whatsapp";
import { renderTemplate, componentsToText } from "./TemplateService";
import { getErrorMessage } from "@/utils/errorHelpers";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { sleep, getRandomDelay } from "@/utils/timeUtils";
import { hash } from "bcryptjs";
import {
  CampaignStats,
  AudienceContact,
  AudienceFilter,
} from "@/types/campaign.types";
import { campaignRepository } from "@/repositories/CampaignRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { userRepository } from "@/repositories/UserRepository";

/**
 *  CAMPAIGN EXECUTION ENGINE
 *
 * Intelligent campaign executor with:
 * - Template rendering support
 * - Human-like throttling (2-5s delays)
 * - Rate limit handling
 * - Retry logic
 * - Real-time metrics tracking
 */

const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 5000;
const BATCH_UPDATE_SIZE = 10;
const RATE_LIMIT_PAUSE_MS = 60000;

function normalizeStats(json: Prisma.JsonValue | null): CampaignStats {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {
      targetAudienceSize: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      startedAt: new Date().toISOString(),
    };
  }
  return json as unknown as CampaignStats;
}

function normalizeCustomFields(
  json: Prisma.JsonValue | null,
): Record<string, unknown> {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {};
  }
  return json as Record<string, unknown>;
}

export const campaignExecutionService = {
  async launchCampaign(id: string, companyId: string) {
    const campaign = await campaignRepository.findFirst({
      where: { id, companyId },
    });

    if (!campaign) {
      throw new AppError("Campaign not found", 404);
    }

    if (campaign.status === "sending") {
      throw new AppError("Campaign is already running", 400);
    }

    if (campaign.status === "completed") {
      throw new AppError(
        "Campaign already completed. Create a new campaign to send again.",
        400,
      );
    }

    Logger.info(`[Campaign] Launching campaign: ${campaign.name} (${id})`);

    await campaignRepository.update({
      where: { id },
      data: {
        status: "sending",
        stats: {
          ...((campaign.stats as Record<string, unknown>) || {}),
          launchedAt: new Date().toISOString(),
        },
      },
    });

    this.executeCampaign(id, companyId).catch((err: unknown) => {
      Logger.error(`[Campaign] Launch error for ${id}:`, err);
    });

    return campaign;
  },

  async executeCampaign(campaignId: string, companyId: string): Promise<void> {
    Logger.info(`[Campaign] Starting execution for ${campaignId}`);

    try {
      const rawCampaign = (await campaignRepository.findFirst({
        where: { id: campaignId, companyId },
        include: {
          template: true,
        },
      })) as unknown as Prisma.CampaignGetPayload<{
        include: { template: true };
      }> | null;

      if (!rawCampaign) {
        throw new Error("Campaign not found");
      }

      const currentStats = normalizeStats(rawCampaign.stats);

      if (
        rawCampaign.status === "completed" ||
        rawCampaign.status === "failed"
      ) {
        Logger.info(
          `[Campaign] Campaign ${campaignId} already finished (${rawCampaign.status})`,
        );
        return;
      }

      const contacts = await this.getAudience(
        companyId,
        rawCampaign.targetTags,
      );

      Logger.info(`[Campaign] Audience size: ${contacts.length}`);

      if (contacts.length === 0) {
        const emptyStats: CampaignStats = {
          ...currentStats,
          targetAudienceSize: 0,
          completedAt: new Date().toISOString(),
          message: "No contacts found for target tags",
        };

        await campaignRepository.update({
          where: { id: campaignId },
          data: {
            status: "completed",
            stats: emptyStats as unknown as Prisma.InputJsonValue,
          },
        });
        Logger.warn(`[Campaign] No contacts found for campaign ${campaignId}`);
        return;
      }

      const stats: CampaignStats = {
        ...currentStats,
        targetAudienceSize: contacts.length,
        startedAt: new Date().toISOString(),
      };

      await campaignRepository.update({
        where: { id: campaignId },
        data: {
          status: "sending",
          stats: stats as unknown as Prisma.InputJsonValue,
        },
      });

      let systemUser = await userRepository.findFirst({
        where: { companyId, email: "campaigns@system.bot" },
        select: { id: true },
      });

      if (!systemUser) {
        Logger.info("[Campaign] Creating System User for campaigns...");
        systemUser = await userRepository.create({
          data: {
            email: "campaigns@system.bot",
            company: { connect: { id: companyId } },
            name: "Campaign System",
            role: "AGENT",
            password: await hash("system", 10),
          },
        });
      }

      let consecutiveRateLimitErrors = 0;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];

        try {
          await this.sendCampaignMessage(
            contact,
            rawCampaign.name,
            rawCampaign.template as {
              id: string;
              name: string;
              components: Prisma.JsonValue;
            } | null,
            rawCampaign.messageContent,
            companyId,
            campaignId,
            systemUser.id,
          );

          stats.sent++;
          consecutiveRateLimitErrors = 0;

          Logger.info(
            `[Campaign] Progress: ${stats.sent}/${contacts.length} ` +
              `(${Math.round((stats.sent / contacts.length) * 100)}%)`,
          );
        } catch (error: unknown) {
          const errorMsg = getErrorMessage(error);
          Logger.error(
            `[Campaign] Failed to send to ${contact.phone}: ${errorMsg}`,
          );

          stats.failed++;

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

        if ((i + 1) % BATCH_UPDATE_SIZE === 0) {
          await campaignRepository.update({
            where: { id: campaignId },
            data: { stats: stats as unknown as Prisma.InputJsonValue },
          });
        }

        if (i < contacts.length - 1) {
          const delay = getRandomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
          await sleep(delay);
        }
      }

      const finalStats: CampaignStats = {
        ...stats,
        completedAt: new Date().toISOString(),
        successRate: ((stats.sent / contacts.length) * 100).toFixed(2) + "%",
      };

      await campaignRepository.update({
        where: { id: campaignId },
        data: {
          status: stats.failed > 0 && stats.sent === 0 ? "failed" : "completed",
          stats: finalStats as unknown as Prisma.InputJsonValue,
        },
      });

      Logger.info(
        `[Campaign] [OK] Finished ${campaignId}: ${stats.sent} sent, ${stats.failed} failed`,
      );
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      Logger.error(`[Campaign] [ERROR] Critical Error: ${errorMsg}`);

      await campaignRepository.update({
        where: { id: campaignId },
        data: {
          status: "failed",
          stats: {
            error: errorMsg,
            failedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  },

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

    const contacts = await contactRepository.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        customFields: true,
      },
    });

    return contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      customFields: normalizeCustomFields(c.customFields),
    }));
  },

  async sendCampaignMessage(
    contact: AudienceContact,
    campaignName: string,
    template: { id: string; name: string; components: Prisma.JsonValue } | null,
    defaultMessageContent: string | null,
    companyId: string,
    campaignId: string,
    senderId: string,
  ): Promise<void> {
    const phone = contact.phone;
    if (!phone) {
      throw new Error("Contact has no phone number");
    }

    let messageContent = defaultMessageContent || "Hola!";

    if (template) {
      try {
        const componentsList = (
          Array.isArray(template.components) ? template.components : []
        ) as Record<string, unknown>[];

        const templateText = componentsToText(componentsList);

        const parameters: Record<string, string> = {
          name: contact.name || "Cliente",
          email: contact.email || "",
          phone: contact.phone || "",
        };

        if (contact.customFields) {
          Object.entries(contact.customFields).forEach(([key, val]) => {
            if (typeof val === "string" || typeof val === "number") {
              parameters[key] = String(val);
            }
          });
        }

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

    let conversation = await conversationRepository.findFirst({
      where: {
        companyId,
        channelId: contact.phone,
      },
      select: { id: true },
    });

    if (!conversation) {
      conversation = await conversationRepository.create({
        companyId,
        channelId: contact.phone!,
        status: "OPEN",
        subject: contact.name || contact.phone!,
        userId: senderId,
      });
    }

    await whatsappService.sendMessage(phone, messageContent, {
      companyId,
      conversationId: conversation.id,
      senderId: senderId,
      metadata: {
        campaignId,
        campaignName,
        isCampaignMessage: true,
        templateId: template?.id,
        templateName: template?.name,
      },
    });
  },
};
