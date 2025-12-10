import { Request, Response } from "express";
import { messageProcessor } from "@/services/messageProcessor.service";
import { Logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";

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
    const user = (req as any).user;
    if (!user || !user.companyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const webhooks = await prisma.webhook.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "desc" },
      });

      return res.status(200).json({ status: "success", data: webhooks });
    } catch (error) {
      Logger.error("Error fetching webhooks:", error);
      return res.status(500).json({ error: "Failed to fetch webhooks" });
    }
  },

  /**
   * Create Webhook
   */
  async createWebhook(req: Request, res: Response) {
    const user = (req as any).user;
    if (!user || !user.companyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { url, events, secretKey } = req.body;

    if (!url || !events || !Array.isArray(events)) {
      return res
        .status(400)
        .json({ error: "Invalid data. URL and events array required." });
    }

    try {
      const webhook = await prisma.webhook.create({
        data: {
          companyId: user.companyId,
          url,
          events,
          secretKey: secretKey || null,
          isActive: true,
        },
      });

      return res.status(201).json({ status: "success", data: webhook });
    } catch (error) {
      Logger.error("Error creating webhook:", error);
      return res.status(500).json({ error: "Failed to create webhook" });
    }
  },

  /**
   * Delete Webhook
   */
  async deleteWebhook(req: Request, res: Response) {
    const user = (req as any).user;
    if (!user || !user.companyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    try {
      // Verify ownership
      const count = await prisma.webhook.count({
        where: { id, companyId: user.companyId },
      });

      if (count === 0) {
        return res.status(404).json({ error: "Webhook not found" });
      }

      await prisma.webhook.delete({
        where: { id },
      });

      return res.status(204).send();
    } catch (error) {
      Logger.error("Error deleting webhook:", error);
      return res.status(500).json({ error: "Failed to delete webhook" });
    }
  },

  /**
   * Toggle Webhook
   */
  async toggleWebhook(req: Request, res: Response) {
    const user = (req as any).user;
    if (!user || !user.companyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    try {
      const webhook = await prisma.webhook.findFirst({
        where: { id, companyId: user.companyId },
      });

      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }

      const updated = await prisma.webhook.update({
        where: { id },
        data: { isActive: !webhook.isActive },
      });

      return res.status(200).json({ status: "success", data: updated });
    } catch (error) {
      Logger.error("Error toggling webhook:", error);
      return res.status(500).json({ error: "Failed to toggle webhook" });
    }
  },
};
