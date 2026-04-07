import { webhookRepository } from "@/repositories/WebhookRepository";
import { AppError } from "@/utils/AppError";
import { messageProcessor } from "@/services/MessageProcessorService";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
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
    return webhookRepository.findManyByCompanyId(companyId);
  },

  /**
   * Create a new webhook
   */
  async createWebhook(companyId: string, data: CreateWebhookDto) {
    return webhookRepository.create(
      companyId,
      data.url,
      data.events,
      data.secretKey || null,
    );
  },

  /**
   * Delete a webhook strictly ensuring ownership
   */
  async deleteWebhook(id: string, companyId: string) {
    // [SEC] Use deleteMany with compound where for strict tenant isolation
    const deleted = await webhookRepository.deleteMany(id, companyId);

    if (deleted.count === 0) {
      throw new AppError("Webhook not found", 404);
    }
  },

  /**
   * Toggle webhook active state
   */
  async toggleWebhook(id: string, companyId: string) {
    const webhook = await webhookRepository.findFirstActive(id, companyId);

    if (!webhook) {
      throw new AppError("Webhook not found", 404);
    }

    return webhookRepository.updateActiveStatus(id, !webhook.isActive);
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
        Logger.info("[Webhook] [OK] Meta webhook verified successfully");
        return challenge as string;
      } else {
        Logger.warn(
          "[Webhook] [WARNING] Meta verification failed: Invalid token or mode",
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
        messageId:
          data.messageId ||
          `webhook_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      });

      // Dispatch internal event
      await webhookDispatcher.dispatch(companyId, "message.received", {
        from: data.from,
        text: data.text,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      Logger.error(
        `[Webhook] [ERROR] Async processing failed for company ${companyId}:`,
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
