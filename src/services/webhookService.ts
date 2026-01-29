import { prisma } from "@/config/database";
import { AppError } from "@/utils/AppError";
import { messageProcessor } from "@/services/messageProcessorService";
import { webhookDispatcher } from "@/services/webhookDispatcher";
import { Logger } from "@/utils/logger";
import {
  CreateWebhookDto,
  WhatsappWebhookDto,
  MetaWebhookQueryDto,
} from "@/schemas/webhookSchemas";

export const webhookService = {
  /**
   * List webhooks for a company
   */
  async listWebhooks(companyId: string) {
    return prisma.webhook.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Create a new webhook
   */
  async createWebhook(companyId: string, data: CreateWebhookDto) {
    return prisma.webhook.create({
      data: {
        companyId,
        url: data.url,
        events: data.events,
        secretKey: data.secretKey || null,
        isActive: true,
      },
    });
  },

  /**
   * Delete a webhook strictly ensuring ownership
   */
  async deleteWebhook(id: string, companyId: string) {
    const count = await prisma.webhook.count({
      where: { id, companyId },
    });

    if (count === 0) {
      throw new AppError("Webhook not found", 404);
    }

    await prisma.webhook.delete({
      where: { id },
    });
  },

  /**
   * Toggle webhook active state
   */
  async toggleWebhook(id: string, companyId: string) {
    const webhook = await prisma.webhook.findFirst({
      where: { id, companyId },
    });

    if (!webhook) {
      throw new AppError("Webhook not found", 404);
    }

    return prisma.webhook.update({
      where: { id },
      data: { isActive: !webhook.isActive },
    });
  },

  /**
   * Verify Meta Webhook Challenge
   */
  verifyMetaChallenge(query: MetaWebhookQueryDto): string {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
        Logger.info("[Webhook] ✅ Meta webhook verified successfully");
        return challenge as string;
      } else {
        Logger.warn(
          "[Webhook] ⚠️ Meta verification failed: Invalid token or mode",
        );
        throw new AppError("Forbidden: Invalid Verify Token", 403);
      }
    }
    throw new AppError("Bad Request: Missing parameters", 400);
  },

  /**
   * Process generic incoming WhatsApp webhook
   * "Fire and Forget" strategy handled here or by caller,
   * but the logic resides here.
   */
  async processIncomingWhatsapp(companyId: string, data: WhatsappWebhookDto) {
    Logger.info(
      `[Webhook] Received message for company ${companyId} from ${data.from}`,
    );

    // Run async logic
    try {
      await messageProcessor.process({
        companyId,
        sessionId: data.sessionId || "external_webhook",
        remoteJid: data.from,
        text: data.text,
        isOutbound: data.direction === "outbound",
        contactName: data.contactName,
        senderName: data.senderName,
      });

      // Dispatch internal event
      await webhookDispatcher.dispatch(companyId, "message.received", {
        from: data.from,
        text: data.text,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      Logger.error(
        `[Webhook] ❌ Async processing failed for company ${companyId}:`,
        err,
      );
      // We don't rethrow here to treat it as fire-and-forget success for the webhook provider
    }
  },

  getLogs(companyId: string) {
    return webhookDispatcher.getLogs(companyId);
  },

  getSigningSecret(companyId: string) {
    return webhookDispatcher.getSigningSecret(companyId);
  },
};
