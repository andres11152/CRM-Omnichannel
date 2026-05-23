import { Logger } from "@/utils/logger";
import { getMediaPlaceholder } from "@/utils/mediaUtils";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { metaMediaService } from "@/services/MetaMediaService";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
import { Channel, MessageDirection } from "@/types/types";

// ─────────────────────────────────────────────────────
//  META WEBHOOK SERVICE (Production-Grade)
//
// Thin orchestrator that processes incoming Meta Cloud API
// webhook payloads using existing CRM infrastructure.
//
// Follows SRP: Controller handles HTTP, this handles business logic.
// ─────────────────────────────────────────────────────

// ─── Parsed Payload Types ───
export interface MetaParsedMessage {
  phoneNumber: string;
  senderName: string;
  messageBody: string;
  messageId: string;
  timestamp: string;
  type: string;
  phoneNumberId: string;
  attachment?: {
    id: string;
    type: string;
    url: string;
    name: string;
    mimeType: string;
  };
}

// ─── Meta Webhook Body (Zod-validated upstream) ───
export interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value: {
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; caption?: string; mime_type?: string };
          video?: { id: string; caption?: string; mime_type?: string };
          audio?: { id: string; mime_type?: string };
          document?: {
            id: string;
            filename?: string;
            caption?: string;
            mime_type?: string;
          };
          [key: string]: unknown;
        }>;
        contacts?: Array<{ profile: { name: string } }>;
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
      };
    }>;
  }>;
}

export class MetaWebhookService {
  /**
   * [ORCHESTRATOR] MAIN ORCHESTRATOR
   *
   * Processes a validated Meta webhook payload end-to-end:
   * 1. Parse Meta JSON → extract message data
   * 2. Resolve companyId from WABA phone_number_id
   * 3. Find/Create Contact
   * 4. Find/Create Conversation
   * 5. Persist Message
   * 6. Dispatch Webhooks
   */
  async processIncomingMessage(body: MetaWebhookBody): Promise<void> {
    // 1. PARSE: Extract structured data from nested Meta JSON
    const parsed = await this.parseMetaPayload(body);
    if (!parsed) return; // Not a valid message (status update, etc.)

    Logger.info(
      `[MetaWebhook] [INBOUND] Message from ${parsed.phoneNumber} (Type: ${parsed.type})`,
    );

    // 2. RESOLVE TENANT: Map WABA phone_number_id → companyId
    const companyId = await this.resolveCompanyId(parsed.phoneNumberId);
    if (!companyId) {
      Logger.warn(
        `[MetaWebhook] [WARNING] No tenant found for phone_number_id: ${parsed.phoneNumberId}. Dropping message.`,
      );
      return;
    }

    // 3. CONTACT: Find or create contact by phone number
    const contact = await contactRepository.upsertByPhone(
      companyId,
      parsed.phoneNumber,
      {
        name: parsed.senderName !== "Unknown" ? parsed.senderName : undefined,
        tags: ["META_CLOUD_API", "WHATSAPP_LEAD"],
      },
    );

    Logger.info(
      `[MetaWebhook] [CONTACT] Contact resolved: ${contact.name} (${contact.phone})`,
    );

    // 4. CONVERSATION: Find or create using the production-proven repository pattern
    const channelId = parsed.phoneNumber; // WhatsApp phone as channel ID (consistent w/ Baileys)
    const conversation = await conversationRepository.findOrCreate({
      companyId,
      channelId,
      customerId: contact.id,
      subject: `WhatsApp: ${contact.name || parsed.phoneNumber}`,
      status: "OPEN",
    });

    Logger.info(
      `[MetaWebhook] [CONVERSATION] Conversation: ${conversation.id} (Status: ${conversation.status})`,
    );

    // 5. DEDUPLICATION: Check if message already exists (idempotency guard)
    const isDuplicate = await messageRepository.doesMessageExist(
      parsed.messageId,
      companyId,
    );
    if (isDuplicate) {
      Logger.warn(
        `[MetaWebhook] [SKIP] Duplicate message skipped: ${parsed.messageId}`,
      );
      return;
    }

    // 6. RESOLVE SENDER: Get a system user to attribute inbound messages
    const systemUser = await messageRepository.getDefaultAgent(companyId);
    if (!systemUser) {
      Logger.error(
        `[MetaWebhook] [ERROR] No admin/agent user found for company ${companyId}. Cannot save message.`,
      );
      return;
    }

    // 7. BUILD METADATA: Attachment info if present
    const metadata = parsed.attachment
      ? {
          attachment: parsed.attachment,
          source: "meta_cloud_api" as const,
          phoneNumberId: parsed.phoneNumberId,
        }
      : {
          source: "meta_cloud_api" as const,
          phoneNumberId: parsed.phoneNumberId,
        };

    // 8. PERSIST MESSAGE: Save to database
    const savedMessage = await messageRepository.create({
      data: {
        companyId,
        conversationId: conversation.id,
        content: parsed.messageBody,
        channel: Channel.WHATSAPP,
        direction: MessageDirection.INBOUND,
        status: "SENT",
        senderId: systemUser.id,
        whatsappMessageId: parsed.messageId,
        metadata,
      },
    });

    Logger.info(
      `[MetaWebhook] [OK] Message saved: ${savedMessage.id} → Conversation ${conversation.id}`,
    );

    // 9. INCREMENT UNREAD COUNTER (Badge Support)
    await conversationRepository.incrementUnread(companyId, conversation.id);

    // 10. DISPATCH DEVELOPER WEBHOOKS (External integrations)
    webhookDispatcher.dispatch(companyId, "message.received", {
      messageId: savedMessage.id,
      conversationId: conversation.id,
      contactId: contact.id,
      content: parsed.messageBody,
      channel: "WHATSAPP",
      direction: "INBOUND",
      source: "meta_cloud_api",
    });

    Logger.info(
      `[MetaWebhook] [DONE] Processing complete for ${parsed.messageId}`,
    );
  }

  // ─── TENANT RESOLUTION ───
  /**
   * Maps Meta's `phone_number_id` to a CRM companyId.
   *
   * Strategy:
   * 1. Look up WhatsAppSession where the `phone` field matches the WABA display_phone_number
   * 2. Or fall back to checking all sessions for this phone_number_id stored in metadata
   *
   * For now, we use the phone field on WhatsAppSession as the canonical link.
   * In the future, a dedicated `MetaIntegration` model could store this mapping.
   */
  private async resolveCompanyId(
    phoneNumberId: string,
  ): Promise<string | null> {
    // Strategy 1: Direct lookup by phone_number_id stored in sessionId convention
    // Many Meta Cloud API setups store the WABA phone_number_id as sessionId
    const sessionByPhoneId =
      await whatsappSessionRepository.findSystemSession(phoneNumberId);
    if (sessionByPhoneId) {
      return sessionByPhoneId.companyId;
    }

    // Strategy 2: Lookup by connected sessions (any active WhatsApp session for the number)
    // This is a fallback — in production a dedicated mapping table is recommended
    const connectedSessions =
      await whatsappSessionRepository.findByStatus("CONNECTED");
    if (connectedSessions.length === 1) {
      // Single-tenant shortcut: if only one company has a connected session, use it
      Logger.info(
        `[MetaWebhook] [FALLBACK] Single-tenant fallback: Using ${connectedSessions[0].companyId}`,
      );
      return connectedSessions[0].companyId;
    }

    return null;
  }

  // ─── META JSON PARSER ───
  /**
   * Extracts structured message data from the deeply nested Meta webhook JSON.
   * Handles text, image, video, audio, and document message types.
   */
  private async parseMetaPayload(
    body: MetaWebhookBody,
  ): Promise<MetaParsedMessage | null> {
    if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      return null; // Status update or non-message webhook
    }

    const change = body.entry[0].changes[0].value;
    const message = change.messages[0];
    const contact = change.contacts?.[0];
    const phoneNumberId = change.metadata?.phone_number_id || "unknown";

    let content = "";
    let attachment: MetaParsedMessage["attachment"];
    const type = message.type;

    // ─── TEXT ───
    if (type === "text" && message.text) {
      content = message.text.body;
    }
    // ─── MEDIA (Image, Video, Audio, Document) ───
    else if (["image", "video", "audio", "document"].includes(type)) {
      const mediaObj = message[type as keyof typeof message] as {
        id: string;
        caption?: string;
        filename?: string;
        mime_type?: string;
      } | undefined;

      content = mediaObj?.caption || getMediaPlaceholder(type);

      if (mediaObj?.id) {
        try {
          // Resolve company for media processing (best-effort)
          const companyId = await this.resolveCompanyId(phoneNumberId);
          if (companyId) {
            const s3Result = await metaMediaService.processMedia(
              mediaObj.id,
              companyId,
            );

            attachment = {
              id: mediaObj.id,
              type: s3Result.type,
              url: s3Result.url,
              name:
                mediaObj.filename || `${type}_${mediaObj.id}`,
              mimeType: mediaObj.mime_type || `${type}/unknown`,
            };
          }
        } catch (error: unknown) {
          Logger.error(
            `[MetaWebhook] [ERROR] Media processing failed for ${mediaObj.id}:`,
            error,
          );
          content = `[ERROR DOWNLOADING ${type.toUpperCase()}]`;
        }
      }
    }

    return {
      phoneNumber: message.from,
      senderName: contact ? contact.profile.name : "Unknown",
      messageBody: content,
      messageId: message.id,
      timestamp: message.timestamp,
      type,
      phoneNumberId,
      attachment,
    };
  }
}

export const metaWebhookService = new MetaWebhookService();
