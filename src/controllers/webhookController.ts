import { Request, Response } from "express";
import { messageProcessor } from "@/services/messageProcessor.service";
import { Logger } from "@/utils/logger";

export const webhookController = {
  /**
   * Handle incoming WhatsApp Webhook (Generic Format)
   * POST /api/webhooks/whatsapp/:companyId
   */
  async handleWhatsappWebhook(req: Request, res: Response) {
    const { companyId } = req.params;
    const payload = req.body;

    // Validate payload
    if (!payload.from || !payload.text) {
      return res
        .status(400)
        .json({ error: "Invalid payload. 'from' and 'text' required." });
    }

    try {
      Logger.info(
        `[Webhook] Received message for company ${companyId} from ${payload.from}`
      );

      // Async processing (don't block webhook response)
      messageProcessor
        .process({
          companyId,
          sessionId: payload.sessionId || "external_webhook",
          remoteJid: payload.from, // e.g., "573001234567@s.whatsapp.net"
          text: payload.text,
          isOutbound: payload.direction === "outbound",
          contactName: payload.contactName,
          senderName: payload.senderName,
        })
        .catch((err) => {
          Logger.error(`[Webhook] Async processing failed:`, err);
        });

      return res.status(200).json({ status: "received" });
    } catch (error) {
      Logger.error(`[Webhook] Error handling webhook:`, error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  /**
   * Meta/Facebook Verification Challenge
   * GET /api/webhooks/meta/:companyId
   */
  async verifyMetaWebhook(req: Request, res: Response) {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED");
        return res.status(200).send(challenge);
      } else {
        return res.sendStatus(403);
      }
    }
    return res.sendStatus(400);
  },

  /**
   * List Webhooks for Company
   */
  async getCompanyWebhooks(req: Request, res: Response) {
    // Mock implementation for now to satisfy build
    return res.status(200).json({ status: "success", data: [] });
  },

  /**
   * Create Webhook
   */
  async createWebhook(req: Request, res: Response) {
    // Mock implementation
    return res.status(201).json({ status: "success", data: { id: "mock-id" } });
  },

  /**
   * Delete Webhook
   */
  async deleteWebhook(req: Request, res: Response) {
    // Mock implementation
    return res.status(204).send();
  },

  /**
   * Toggle Webhook
   */
  async toggleWebhook(req: Request, res: Response) {
    // Mock implementation
    return res.status(200).json({ status: "success", data: { active: true } });
  },
};
