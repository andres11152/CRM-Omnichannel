import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { Logger } from "@/utils/logger";
import { chatService } from "@/services/ChatService";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";

/**
 * GET /api/webhooks/whatsapp/meta
 * Webhook Verification endpoint required by Meta.
 */
export const verifyMetaWebhook = catchAsync(async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token) {
    // 1. Check global env token first
    const globalToken = process.env.META_VERIFY_TOKEN;
    if (globalToken && token === globalToken) {
      Logger.info("[MetaWebhook] Global verification successful");
      return res.status(200).send(challenge);
    }

    // 2. Check session-specific verify tokens in DB
    const sessionRepository = new WhatsAppSessionRepository();
    const session = await sessionRepository.findSessionByVerifyToken(String(token));

    if (session) {
      Logger.info(`[MetaWebhook] Session-specific verification successful for sessionId: ${session.sessionId}`);
      return res.status(200).send(challenge);
    }
  }

  Logger.warn("[MetaWebhook] Verification failed or invalid payload", { query: req.query });
  return res.status(403).send("Forbidden");
});

/**
 * POST /api/webhooks/whatsapp/meta
 * Incoming messaging webhook events from Meta Cloud API.
 */
export const handleMetaWebhookEvent = catchAsync(async (req: Request, res: Response) => {
  const body = req.body;

  // Meta webhook payload validation
  if (body.object !== "whatsapp_business_account") {
    return res.status(200).json({ status: "ignored" });
  }

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const recipientPhoneId = metadata.phone_number_id;

      if (!recipientPhoneId) continue;

      // 1. Resolve multi-tenant scope by finding session with phone_number_id using Repository
      const sessionRepository = new WhatsAppSessionRepository();
      const session = await sessionRepository.findActiveSessionByPhoneId(recipientPhoneId);

      if (!session) {
        Logger.warn(`[MetaWebhook] Received event for unregistered or disconnected phone number ID: ${recipientPhoneId}`);
        continue;
      }

      const { companyId } = session;

      // 2. Process incoming messages
      const messages = value.messages || [];
      const contacts = value.contacts || [];

      for (const msg of messages) {
        const from = msg.from; // Sender phone number
        const contactInfo = contacts.find((c: { wa_id: string; profile?: { name?: string } }) => c.wa_id === from);
        const name = contactInfo?.profile?.name || `WhatsApp User ${from}`;

        if (msg.type === "text") {
          const text = msg.text?.body || "";
          const msgId = msg.id;

          Logger.info(`[MetaWebhook] Ingesting text message from ${from} | Company: ${companyId}`);

          // Standardized CRM upsert of conversation and message
          await chatService.upsertMessage({
            whatsappMessageId: msgId,
            companyId,
            content: text,
            direction: "INBOUND",
            conversationId: from, // use customer phone as conversationId
            senderId: "customer",
            status: "DELIVERED",
            metadata: {
              metaMessageId: msgId,
              timestamp: msg.timestamp,
              profileName: name
            }
          });
        }
      }

      // 3. Process status updates (sent, delivered, read receipts)
      const statuses = value.statuses || [];
      for (const status of statuses) {
        const msgId = status.id;
        const recipientId = status.recipient_id;
        const msgStatus = status.status; // sent, delivered, read

        let mappedStatus: "SENT" | "DELIVERED" | "READ" | "FAILED" = "SENT";
        if (msgStatus === "delivered") mappedStatus = "DELIVERED";
        else if (msgStatus === "read") mappedStatus = "READ";
        else if (msgStatus === "failed") mappedStatus = "FAILED";

        Logger.debug(`[MetaWebhook] Updating message status: ${msgId} -> ${mappedStatus}`);

        // Update status in CRM database using Repository
        await messageRepository.updateByWhatsAppId(msgId, companyId, { status: mappedStatus });
      }
    }
  }

  return res.status(200).json({ status: "success" });
});
