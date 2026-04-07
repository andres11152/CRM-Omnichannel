import { Prisma } from "@prisma/client";
import { whatsappService } from "@/whatsapp";
import { renderTemplate, componentsToText } from "./templateService";
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
 *
 * [SEC] ARCHITECTURE: Zero direct Prisma calls.
 * All DB access goes through repositories.
 */

// [SEC] THROTTLING CONFIGURATION
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 5000;
const BATCH_UPDATE_SIZE = 10;
const RATE_LIMIT_PAUSE_MS = 60000;

//  Type Guard for Campaign Stats
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

//  Type Guard for Custom Fields
function normalizeCustomFields(
  json: Prisma.JsonValue | null,
): Record<string, unknown> {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {};
  }
  return json as Record<string, unknown>;
}

import {
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/schemas/campaignSchema";

export const campaignService = {
  async createCampaign(
    companyId: string,
    userId: string,
    data: CreateCampaignInput,
  ) {
    const initialStats = {
      targetAudienceSize: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
    };
    return await campaignRepository.create({
      data: {
        companyId,
        name: data.name,
        messageContent: data.messageContent || "",
        targetTags: data.targetTags || [],
        config: data.config || {},
        templateId: data.templateId || undefined,
        status: data.status || "draft",
        stats: initialStats,
        channel: data.channel || "WHATSAPP",
        subject: data.subject || undefined,
        createdById: userId || undefined,
      },
    });
  },

  async getCampaigns(companyId: string, filters: Record<string, unknown>) {
    const { status, search, limit, offset } = filters;
    const where: Prisma.CampaignWhereInput = { companyId };
    if (status) where.status = status as string;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { messageContent: { contains: search as string, mode: "insensitive" } },
      ];
    }
    return await campaignRepository.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit ? parseInt(limit as string) : 50,
      skip: offset ? parseInt(offset as string) : 0,
    });
  },

  async getCampaign(id: string, companyId: string) {
    return await campaignRepository.findFirst({
      where: { id, companyId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  async updateCampaign(
    id: string,
    companyId: string,
    data: UpdateCampaignInput,
  ) {
    return await campaignRepository.update({
      where: { id },
      data: {
        name: data.name,
        messageContent: data.messageContent,
        targetTags: data.targetTags,
        config: data.config
          ? (data.config as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        status: data.status,
        templateId: data.templateId,
        channel: data.channel,
        subject: data.subject,
      },
    });
  },

  async deleteCampaign(id: string) {
    return await campaignRepository.delete(id);
  },

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

  /**
   * Execute campaign with intelligent throttling and error handling
   */
  async executeCampaign(campaignId: string, companyId: string): Promise<void> {
    Logger.info(`[Campaign] Starting execution for ${campaignId}`);

    try {
      // 1. Fetch Campaign (Optimized Select)
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

      // Safe Typed Object Construction
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

      // 2. Fetch Audience
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

      // 3. Initialize Stats
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

      //  PREPARATION: Resolve System User ONCE (Optimization)
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

      // 4. Execute Campaign
      let consecutiveRateLimitErrors = 0;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];

        try {
          // Send message
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
          await campaignRepository.update({
            where: { id: campaignId },
            data: { stats: stats as unknown as Prisma.InputJsonValue },
          });
        }

        // Human-like delay
        if (i < contacts.length - 1) {
          const delay = getRandomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
          await sleep(delay);
        }
      }

      // 5. Final Update
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

    // Map Prisma result to strict type
    return contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      customFields: normalizeCustomFields(c.customFields),
    }));
  },

  /**
   * Send individual campaign message with template support
   */
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
        // Safe cast for components list
        const componentsList = (
          Array.isArray(template.components) ? template.components : []
        ) as Record<string, unknown>[];

        const templateText = componentsToText(componentsList);

        const parameters: Record<string, string> = {
          name: contact.name || "Cliente",
          email: contact.email || "",
          phone: contact.phone || "",
        };

        // [SEC] Safe mapping of unknown custom fields to string parameters
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

    // Reuse existing conversation via repository
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

    // Use injected senderId instead of redundant DB lookup
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
