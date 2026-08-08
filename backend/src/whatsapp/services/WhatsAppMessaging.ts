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
import { whatsappServiceHttp } from "../utils/whatsAppServiceHttp";
import { getEnv } from "@/config/env";

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
      // [SEC] The Baileys socket lives exclusively in whatsapp-service now —
      // this.sessionManager is the local (backend) manager, which never has a
      // session since no socket is ever created here. Checking it always
      // returned null, so every send threw 503 "No active WhatsApp session"
      // before ever reaching the enqueue step below. Ask whatsapp-service
      // directly instead, same as the session-list endpoint already does.
      const sessionsRes = await whatsappServiceHttp.get<{ sessionId: string; status: string }[]>(
        `/sessions/${options.companyId}`,
      );
      const sessions = sessionsRes.data;
      let activeSession = sessions.find((s) => s.status === "CONNECTED");

      // [SEC] HIGH AVAILABILITY ENQUEUE: If no CONNECTED session, check if any session exists
      // as it might be currently RECONNECTING. The Worker handles wait-for-ready.
      if (!activeSession && sessions[0]) {
        activeSession = sessions[0];
      }

      if (!activeSession) {
        throw new AppError(
          "No active WhatsApp session found. Please go to Settings and scan the QR code to reconnect.",
          503,
        );
      }

      await this.rateLimitService.enforceLimit(activeSession.sessionId);

      // [PERF] Resolve base64 media to a hosted S3 URL here, before the job
      // is even enqueued. Doing this inside the send worker instead ties up
      // that company's concurrency-1 queue slot (and the per-conversation
      // DistributedLock) for the whole upload, blocking every other queued
      // message behind it — and it also means the raw base64 blob sits in
      // the BullMQ job payload in Redis in the meantime.
      const { uploadBase64MediaToS3 } = await import("../utils/mediaUpload");
      const uploadedMedia = await uploadBase64MediaToS3(options.companyId, options.media);

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
        media: uploadedMedia,
        quotedMessageId: options.quotedMessageId, // ️ FIX: Pass quoted message ID to queue
        // Metadata payload for worker
        metadata: {
          ...options.metadata,
          dbId: savedMessage.id, // Linked to the QUEUED record
          generatedMessageId: generatedId, // Pass consistent ID to worker
        },
      });

      // 3. Return the saved record for immediate UI feedback. Status is
      // genuinely "QUEUED" at this point — the message hasn't reached Baileys
      // yet, it's just been handed to messageQueueService. Callers must not
      // assume "SENT" here; the real outcome arrives later via the
      // message.status socket event once executeQueuedMessage() runs.
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
        status: savedMessage.status,
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
      // [SEC] LOCAL-DEV ONLY: rewrite the origin of the outbound media URL
      // whatsapp-service will fetch to build the Baileys payload. The URL was
      // built by the browser (host machine's view of the backend); in the
      // local docker-compose setup whatsapp-service runs in its own
      // container where that origin is unreachable. Never touches the DB
      // record or what the frontend displays — only this outbound copy.
      // No-op whenever WA_MEDIA_FETCH_HOST_OVERRIDE is unset (production).
      let media = options.media;
      const overrideHost = getEnv().WA_MEDIA_FETCH_HOST_OVERRIDE;
      if (media?.url && overrideHost) {
        try {
          const rewritten = new URL(media.url, overrideHost);
          const overrideOrigin = new URL(overrideHost);
          rewritten.protocol = overrideOrigin.protocol;
          rewritten.host = overrideOrigin.host;
          media = { ...media, url: rewritten.toString() };
        } catch {
          // Malformed URL — fall through with the original, unmodified media.
        }
      }

      const res = await whatsappServiceHttp.post(
        `/messages/send`,
        {
          companyId: options.companyId,
          to,
          type: media ? "media" : "text",
          content,
          media,
          options: {
            quoted: (options as SendMessageOptions & { quoted?: unknown }).quoted,
            generatedMessageId: options.metadata?.generatedMessageId,
          },
        },
        // Media sends (Baileys downloads/uploads the file itself) need more
        // headroom than the 20s default.
        { timeout: 45000 },
      );

      const { messageRepository } = await import("@/repositories/MessageRepository");
      const dbId = options.dbId || (options.metadata?.dbId as string);
      let savedMessage;
      if (dbId) {
        savedMessage = await messageRepository.update(dbId, {
          status: "SENT",
          whatsappMessageId: res.data.messageId,
        }, options.companyId);
      }

      if (savedMessage) {
        const { gateway } = await import("@/gateways/socketGateway");
        const { SocketEventEmitter } = await import("@/services/SocketEventEmitter");
        const ticketId = (options.metadata?.originalTicketId as string) || undefined;
        new SocketEventEmitter(gateway).emitMessageStatus(
          savedMessage.id,
          options.conversationId,
          options.companyId,
          "sent",
          ticketId,
        );
      }

      return {
        success: true,
        messageId: res.data.messageId,
        sentAt: new Date(),
      };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      import("@/utils/logger").then(({ Logger }) => {
        Logger.error(`[WhatsAppMessaging] executeQueuedMessage failed via microservice:`, {
          sessionId,
          companyId: options.companyId,
          conversationId: options.conversationId,
          dbId: options.dbId,
          to,
          error: err.message,
        });
      });
      throw error;
    }
  }

  // ────────────────────────────────────────────────
  // TYPING SIMULATION
  // ────────────────────────────────────────────────

  async simulateTyping(sessionId: string, to: string) {
    const activeSession = await this.sessionManager.getSessionInfo(sessionId);
    if (activeSession) {
      await whatsappServiceHttp.post(`/messages/presence`, {
        companyId: activeSession.companyId,
        to,
        type: "composing",
      }).catch(() => null);
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
    await whatsappServiceHttp.post(`/messages/presence`, {
      companyId,
      to,
      type,
    }).catch(() => null);
  }

  async sendReaction(
    to: string,
    messageId: string,
    reaction: string,
    companyId: string,
    fromMe?: boolean,
  ): Promise<void> {
    await whatsappServiceHttp.post(`/messages/reaction`, {
      companyId,
      to,
      messageId,
      reaction,
      fromMe,
    }).catch(() => null);
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

  async pinMessage(
    to: string,
    messageId: string,
    fromMe: boolean,
    pin: boolean,
    companyId: string,
  ): Promise<void> {
    return this.messageHandler.pinMessage(to, messageId, fromMe, pin, companyId);
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
  // OWN PROFILE (name / picture)
  // ────────────────────────────────────────────────

  async updateOwnProfileName(companyId: string, name: string): Promise<void> {
    return this.messageHandler.updateOwnProfileName(companyId, name);
  }

  async updateOwnProfilePicture(companyId: string, imageUrl: string): Promise<void> {
    return this.messageHandler.updateOwnProfilePicture(companyId, imageUrl);
  }

  // ────────────────────────────────────────────────
  // GROUP MANAGEMENT (gated behind WA_ENABLE_GROUP_MANAGEMENT)
  // ────────────────────────────────────────────────

  async updateGroupParticipants(
    companyId: string,
    groupId: string,
    participantPhones: string[],
    action: "add" | "remove" | "promote" | "demote",
  ): Promise<{ jid: string; status: string }[]> {
    return this.messageHandler.updateGroupParticipants(companyId, groupId, participantPhones, action);
  }

  async updateGroupSubject(companyId: string, groupId: string, subject: string): Promise<void> {
    return this.messageHandler.updateGroupSubject(companyId, groupId, subject);
  }

  async updateGroupDescription(companyId: string, groupId: string, description: string): Promise<void> {
    return this.messageHandler.updateGroupDescription(companyId, groupId, description);
  }

  async updateGroupSetting(
    companyId: string,
    groupId: string,
    setting: "announcement" | "not_announcement" | "locked" | "unlocked",
  ): Promise<void> {
    return this.messageHandler.updateGroupSetting(companyId, groupId, setting);
  }

  async getGroupInviteCode(companyId: string, groupId: string): Promise<string> {
    return this.messageHandler.getGroupInviteCode(companyId, groupId);
  }

  async revokeGroupInviteCode(companyId: string, groupId: string): Promise<string> {
    return this.messageHandler.revokeGroupInviteCode(companyId, groupId);
  }

  async leaveGroup(companyId: string, groupId: string): Promise<void> {
    return this.messageHandler.leaveGroup(companyId, groupId);
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
