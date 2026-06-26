import { webhookRepository } from "@/repositories/WebhookRepository";
import { AppError } from "@/utils/AppError";
import { messageProcessor } from "@/services/MessageProcessorService";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
import crypto from "crypto";
import { Logger } from "@/utils/logger";
import {
  CreateWebhookDto,
  WhatsappWebhookDto,
  MetaWebhookQueryDto,
} from "@/schemas/webhookSchemas";

export const webhookService = {
  async listWebhooks(companyId: string) {
    return webhookRepository.findManyByCompanyId(companyId);
  },

  async createWebhook(companyId: string, data: CreateWebhookDto) {
    const secret = data.secretKey ?? crypto.randomBytes(32).toString("hex");
    return webhookRepository.create(
      companyId,
      data.url,
      data.events,
      secret,
      data.description,
    );
  },

  async deleteWebhook(id: string, companyId: string) {
    const deleted = await webhookRepository.deleteMany(id, companyId);
    if (deleted.count === 0) {
      throw new AppError("Webhook not found", 404);
    }
  },

  async toggleWebhook(id: string, companyId: string) {
    const webhook = await webhookRepository.findFirstActive(id, companyId);
    if (!webhook) {
      throw new AppError("Webhook not found", 404);
    }
    return webhookRepository.updateActiveStatus(id, !webhook.isActive);
  },

  verifyMetaChallenge(query: MetaWebhookQueryDto): string {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
        Logger.info("[Webhook] [OK] Meta webhook verified successfully");
        return challenge as string;
      }
      Logger.warn(
        "[Webhook] [WARNING] Meta verification failed: Invalid token or mode",
      );
      throw new AppError("Forbidden: Invalid Verify Token", 403);
    }
    throw new AppError("Bad Request: Missing parameters", 400);
  },

  async processIncomingWhatsapp(companyId: string, data: WhatsappWebhookDto) {
    Logger.info(
      `[Webhook] Received message for company ${companyId} from ${data.from}`,
    );

    try {
      await messageProcessor.process({
        companyId,
        sessionId: data.sessionId ?? "external_webhook",
        remoteJid: data.from,
        text: data.text,
        isOutbound: data.direction === "outbound",
        contactName: data.contactName,
        senderName: data.senderName,
        messageId:
          data.messageId ??
          `webhook_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      });

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
    }
  },

  async getLogs(companyId: string) {
    return webhookDispatcher.getLogs(companyId);
  },

  async replayLog(companyId: string, logId: string) {
    return webhookDispatcher.replayLog(companyId, logId);
  },

  getSigningSecret(companyId: string) {
    return webhookDispatcher.getSigningSecret(companyId);
  },
};
