/**
 *  WHATSAPP MESSAGING SERVICE
 *
 * All outbound messaging logic:
 * - sendMessage: Direct message dispatch with rate limiting
 * - executeQueuedMessage: Worker interface for queue-based dispatch
 * - simulateTyping: Human-like typing indicators
 * - sendPresenceUpdate: Composing/recording/paused presence
 * - sendTemplate: Template hydration with media header support
 * - inferMimeType: MIME type inference from extension/format
 */

import { ISessionManager } from "../core/interfaces/ISessionManager";
import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { RateLimitService } from "../services/RateLimitService";
import {
  SendMessageOptions,
  MessagePayload,
  TemplateComponent,
  MediaPayload,
} from "../core/types/whatsapp.types";
import { Prisma } from "@prisma/client";
import { ChatModification } from "@whiskeysockets/baileys";
import { WhatsAppIdUtils } from "../utils/WhatsAppIdUtils";
import { messageTemplateRepository } from "@/repositories/MessageTemplateRepository";
import { AppError } from "@/utils/AppError";
import { OutboundMessageHandler } from "../providers/handlers/OutboundMessageHandler";

export class WhatsAppMessaging {
  private outboundHandler: OutboundMessageHandler;

  constructor(
    private sessionManager: ISessionManager,
    private messageHandler: IMessageHandler,
    private rateLimitService: RateLimitService,
  ) {
    this.outboundHandler = new OutboundMessageHandler(sessionManager);
  }

  // ────────────────────────────────────────────────
  // SEND MESSAGE (Direct Execution)
  // ────────────────────────────────────────────────

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    try {
      let activeSession =
        await this.sessionManager.findActiveSessionForCompany(
          options.companyId,
        );

      // [SEC] HIGH AVAILABILITY ENQUEUE: If no CONNECTED session, check if any session exists
      // as it might be currently RECONNECTING. The Worker handles wait-for-ready.
      if (!activeSession) {
        const sessions = await this.sessionManager.listSessions(options.companyId);
        const anySession = sessions[0];
        if (anySession) {
          // Bypassing strict CONNECTED check because the Worker will wait for it.
          // @ts-expect-error - socket not needed for enqueuing
          activeSession = { sessionId: anySession.sessionId };
        }
      }

      if (!activeSession) {
        throw new AppError(
          "No active WhatsApp session found. Please go to Settings and scan the QR code to reconnect.",
          503,
        );
      }

      await this.rateLimitService.enforceLimit(activeSession.sessionId);

      // [BUILD] 1. SAVE IN DB AS "QUEUED" (Audit Trail)
      const { chatService } = await import("@/services/ChatService");
      const { generateMessageID } = await import("@whiskeysockets/baileys");
      
      const generatedId = generateMessageID();

      const savedMessage = await chatService.upsertMessage({
        whatsappMessageId: generatedId,
        companyId: options.companyId,
        content: content,
        direction: "OUTBOUND",
        conversationId: options.conversationId,
        senderId: options.senderId,
        status: "QUEUED",
        metadata: {
          ...options.metadata,
          isQueued: true,
          generatedMessageId: generatedId,
        },
      });

      // [BUILD] 2. ENQUEUE: Add to the official multi-tenant queue
      const { messageQueueService } =
        await import("@/services/queue/messageQueueService");

      await messageQueueService.enqueue({
        companyId: options.companyId,
        conversationId: options.conversationId,
        senderId: options.senderId,
        to,
        text: content,
        media: options.media,
        quotedMessageId: options.quotedMessageId, // ️ FIX: Pass quoted message ID to queue
        // Metadata payload for worker
        metadata: {
          ...options.metadata,
          dbId: savedMessage.id, // Linked to the QUEUED record
          generatedMessageId: generatedId, // Pass consistent ID to worker
        },
      });

      // 3. Return the saved record for immediate UI feedback
      return {
        messageId: savedMessage.whatsappMessageId!,
        companyId: savedMessage.companyId,
        sessionId: activeSession.sessionId,
        from: "agent",
        sender: "agent",
        to,
        content: savedMessage.content,
        timestamp: savedMessage.createdAt,
        metadata: savedMessage.metadata as Record<string, Prisma.JsonValue>,
        dbId: savedMessage.id,
      };
    } catch (error: unknown) {
      if (!(error instanceof AppError)) {
        const err = error instanceof Error ? error : new Error(String(error));
        import("@/utils/logger").then(({ Logger }) => {
          Logger.error(`[WhatsAppMessaging] sendMessage failed`, {
            companyId: options.companyId,
            conversationId: options.conversationId,
            senderId: options.senderId,
            to,
            error: err.message,
            stack: err.stack,
          });
        });
      }
      throw error;
    }
  }

  // ────────────────────────────────────────────────
  // WORKER INTERFACE: Execute Actual Sending
  // ────────────────────────────────────────────────

  async executeQueuedMessage(
    sessionId: string,
    to: string,
    content: string,
    options: SendMessageOptions & { dbId?: string },
  ) {
    try {
      // This is called by the worker. We bypass the secondary queue (whatsapp-outbound) here
      // to ensure the message is dispatched immediately by the worker holding the socket.
      const result = options.media
        ? await this.outboundHandler.sendMedia(to, options.media, options)
        : await this.outboundHandler.sendMessage(to, content, options);

      // OutboundMessageHandler now handles DB updates automatically using options.metadata.dbId.
      // We no longer need to update the QUEUED message here.

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      import("@/utils/logger").then(({ Logger }) => {
        Logger.error(`[WhatsAppMessaging] executeQueuedMessage failed`, {
          sessionId,
          companyId: options.companyId,
          conversationId: options.conversationId,
          dbId: options.dbId,
          to,
          error: err.message,
          stack: err.stack,
        });
      });
      throw error;
    }
  }

  // ────────────────────────────────────────────────
  // TYPING SIMULATION
  // ────────────────────────────────────────────────

  async simulateTyping(sessionId: string, to: string) {
    const sock = this.sessionManager.getSession(sessionId);
    if (sock) {
      const jid = WhatsAppIdUtils.getTargetJid(to);
      await sock.sendPresenceUpdate("composing", jid);
    }
  }

  // ────────────────────────────────────────────────
  // PRESENCE UPDATE (Composing/Recording)
  // ────────────────────────────────────────────────

  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    const activeSession =
      await this.sessionManager.findActiveSessionForCompany(companyId);

    if (!activeSession) {
      return;
    }

    return this.messageHandler.sendPresenceUpdate(to, type, companyId);
  }

  async sendReaction(
    to: string,
    messageId: string,
    reaction: string,
    companyId: string,
    fromMe?: boolean,
  ): Promise<void> {
    return this.messageHandler.sendReaction(to, messageId, reaction, companyId, fromMe);
  }

  // ────────────────────────────────────────────────
  // EDIT / REVOKE OWN SENT MESSAGE
  // ────────────────────────────────────────────────

  async editMessage(
    to: string,
    messageId: string,
    newContent: string,
    companyId: string,
  ): Promise<void> {
    return this.messageHandler.editOutboundMessage(to, messageId, newContent, companyId);
  }

  async revokeMessage(to: string, messageId: string, companyId: string): Promise<void> {
    return this.messageHandler.revokeOutboundMessage(to, messageId, companyId);
  }

  // ────────────────────────────────────────────────
  // BLOCK / UNBLOCK CONTACT
  // ────────────────────────────────────────────────

  async blockContact(to: string, companyId: string): Promise<void> {
    return this.messageHandler.updateBlockStatus(to, "block", companyId);
  }

  async unblockContact(to: string, companyId: string): Promise<void> {
    return this.messageHandler.updateBlockStatus(to, "unblock", companyId);
  }

  // ────────────────────────────────────────────────
  // CHAT MODIFY (Archive / Pin / Mute)
  // ────────────────────────────────────────────────

  async modifyChat(
    to: string,
    companyId: string,
    mod: ChatModification,
  ): Promise<void> {
    return this.messageHandler.modifyChat(to, companyId, mod);
  }

  // ────────────────────────────────────────────────
  // SEND TEMPLATE (Enhanced with Media Header)
  // ────────────────────────────────────────────────

  async sendTemplate(
    to: string,
    templateId: string,
    params: Record<string, string>,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const template = await messageTemplateRepository.findById(templateId);

    if (!template) {
      throw new AppError(`Template not found: ${templateId}`, 404);
    }

    const components = template.components as unknown as TemplateComponent[];

    // Extract HEADER (if media type)
    const header = components.find((c) => c.type === "HEADER");
    let mediaPayload: MediaPayload | undefined;

    if (header && header.format && header.format !== "TEXT") {
      const mediaUrl = header.url || (params["headerMediaUrl"] as string);

      if (mediaUrl) {
        const formatToType: Record<string, MediaPayload["type"]> = {
          IMAGE: "image",
          VIDEO: "video",
          DOCUMENT: "document",
        };

        mediaPayload = {
          type: formatToType[header.format] || "document",
          url: mediaUrl,
          mimetype: this.inferMimeType(header.format, mediaUrl),
          filename: header.filename || params["headerFilename"],
          caption: undefined,
        };
      }
    }

    // Extract BODY and hydrate with params
    let bodyText = components
      .filter((c) => c.type === "BODY")
      .map((c) => c.text || "")
      .join("\n");

    Object.entries(params).forEach(([key, value]) => {
      bodyText = bodyText.replace(new RegExp(`{{${key}}}`, "g"), value);
    });

    // Dispatch: Media with caption OR text only
    if (mediaPayload) {
      mediaPayload.caption = bodyText;
      return this.sendMessage(to, bodyText, {
        ...options,
        media: mediaPayload,
      });
    }

    return this.sendMessage(to, bodyText, options);
  }

  // ────────────────────────────────────────────────
  // MIME TYPE INFERENCE
  // ────────────────────────────────────────────────

  inferMimeType(format: string, url: string): string {
    const ext = url.split(".").pop()?.toLowerCase() || "";

    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };

    if (mimeMap[ext]) return mimeMap[ext];

    const formatDefaults: Record<string, string> = {
      IMAGE: "image/jpeg",
      VIDEO: "video/mp4",
      DOCUMENT: "application/octet-stream",
    };

    return formatDefaults[format] || "application/octet-stream";
  }
}
