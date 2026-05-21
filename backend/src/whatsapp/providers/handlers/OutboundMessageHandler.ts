import { ISessionManager } from "../../core/interfaces/ISessionManager";
import {
  SendMessageOptions,
  MediaPayload,
  MessagePayload,
} from "../../core/types/whatsapp.types";
import { MessageMetadata } from "@/types/whatsapp.types";
import { generateMessageID } from "@whiskeysockets/baileys";
import { WhatsAppIdUtils } from "../../utils/WhatsAppIdUtils";
import { Logger } from "@/utils/logger";
import { deduplicationService } from "../../services/DeduplicationService";
import { chatService } from "@/services/ChatService";
import { cleanupTempFile } from "@/utils/audioConverter";
import {
  mediaProcessor,
  MediaFileNotFoundError,
} from "../../services/MediaProcessorService";
import { getMediaPlaceholder } from "@/utils/mediaUtils";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { TenantContextManager } from "@/config/tenantContext";
import { Prisma, Message } from "@prisma/client";

const prepareMetadataForDB = (meta: MessageMetadata): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(meta));
};

export class OutboundMessageHandler {
  private socketEmitter: SocketEventEmitter;

  constructor(private sessionManager: ISessionManager) {
    this.socketEmitter = new SocketEventEmitter(gateway);
  }

  private mapToMessagePayload(
    msg: Message & { whatsappMessageId: string | null },
    sessionId: string,
    to: string,
  ): MessagePayload {
    return {
      sessionId,
      companyId: msg.companyId,
      from: msg.direction === "INBOUND" ? "customer" : "agent",
      sender: msg.direction === "INBOUND" ? "customer" : "agent",
      to,
      content: msg.content || "",
      messageId: msg.whatsappMessageId || "",
      timestamp: msg.createdAt,
      metadata: msg.metadata as Record<string, unknown>,
      dbId: msg.id,
    };
  }
  private async resolveDestinationJid(
    to: string,
    companyId: string,
    sessionId: string,
  ): Promise<string> {
    if (to.includes("@g.us")) return to;
    if (to.includes("@s.whatsapp.net")) return to;

    const cleanId = to.split("@")[0].split(":")[0];
    const isLid = WhatsAppIdUtils.isLid(to) || 
                  (cleanId.startsWith("45") && cleanId.length === 14) ||
                  (cleanId.length >= 15 && !cleanId.startsWith("120"));

    if (isLid) {
      const fullLidJid = to.includes("@lid") ? to : `${cleanId}@lid`;

      // Strategy A: Memory Store lookup
      const resolvedContact = this.sessionManager.findContactByLid(sessionId, fullLidJid);
      if (resolvedContact?.id && !WhatsAppIdUtils.isLid(resolvedContact.id)) {
        const realJid = WhatsAppIdUtils.getCleanJid(resolvedContact.id);
        if (realJid) {
          Logger.info(`[OutboundHandler] Resolved outbound LID ${to} via memory store -> ${realJid}`);
          return realJid;
        }
      }

      // Strategy B: Database Contact mapping
      try {
        const contact = await chatService.findContactByLid(companyId, cleanId);
        if (contact && contact.phone) {
          const phoneJid = `${contact.phone.replace(/\D/g, "")}@s.whatsapp.net`;
          Logger.info(`[OutboundHandler] Resolved outbound LID ${to} via DB mapping -> ${phoneJid}`);
          return phoneJid;
        }
      } catch (err) {
        Logger.warn(`[OutboundHandler] Failed to query contact by LID for ${cleanId}`, err);
      }

      // Strategy C: Active WhatsApp resolve
      try {
        const resolvedPhone = await this.sessionManager.resolveLidToPhone(sessionId, fullLidJid);
        if (resolvedPhone) {
          const phoneJid = `${resolvedPhone.replace(/\D/g, "")}@s.whatsapp.net`;
          Logger.info(`[OutboundHandler] Resolved outbound LID ${to} via active query -> ${phoneJid}`);
          
          const cleanPhone = WhatsAppIdUtils.getPhoneNumber(resolvedPhone);
          if (cleanPhone) {
            await chatService.saveLidPhoneMapping(companyId, cleanId, cleanPhone);
          }
          return phoneJid;
        }
      } catch (err) {
        Logger.warn(`[OutboundHandler] Active LID resolution failed for ${fullLidJid}`, err);
      }

      return fullLidJid;
    }

    return WhatsAppIdUtils.getTargetJid(to);
  }

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { companyId, conversationId, senderId, metadata } = options;

    try {
      const activeSession =
        await this.sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        throw new Error(`No active WhatsApp session for company: ${companyId}`);
      }
      const sock = activeSession.socket;

      // [SEC] CRITICAL FIX: Use WhatsAppIdUtils to properly detect groups vs DMs, with LID resolution fallback
      const jid = await this.resolveDestinationJid(to, companyId, activeSession.sessionId);
      const generatedId =
        (metadata?.generatedMessageId as string) || generateMessageID();
      await deduplicationService.markMessageSent(generatedId);

      await deduplicationService.markContentSent(conversationId, content);

      // [SYNC] RESOLVE QUOTED MESSAGE (UUID -> WhatsApp ID)
      let quotedMsg;
      if (options.quotedMessageId) {
        const dbQuoted = await messageRepository.findFirst({
          where: { id: options.quotedMessageId, companyId },
        });
        if (dbQuoted && dbQuoted.whatsappMessageId) {
          const isGroup = jid.endsWith("@g.us");
          const participant = dbQuoted.direction === "INBOUND" && isGroup
            ? ((dbQuoted.metadata as Prisma.JsonObject)?.senderJid as string | undefined) 
            : undefined;

          // [SEC] CRITICAL FIX: WhatsApp silently drops group messages if they quote a message
          // but lack the 'participant' field. If we don't have the senderJid, we MUST omit the quote!
          if (isGroup && dbQuoted.direction === "INBOUND" && !participant) {
            Logger.warn(`[OutboundHandler] Missing senderJid for quoted group message. Dropping quote to ensure delivery.`);
          } else {
            quotedMsg = {
              key: {
                remoteJid: jid,
                fromMe: dbQuoted.direction === "OUTBOUND",
                id: dbQuoted.whatsappMessageId,
                participant: participant,
              },
              message: {
                conversation:
                  (metadata?.quotedContent as string) ||
                  dbQuoted.content ||
                  "Original message",
              },
            };
          }
        }
      }

      // [SEC] ENTERPRISE FIX: Ensure Baileys has the group metadata cached before sending.
      // If the backend was restarted, Baileys' in-memory store forgets the participants.
      // Without participants, Baileys cannot distribute the Sender Key, causing WhatsApp to silently drop the message!
      if (jid.endsWith("@g.us")) {
        try {
          await sock.groupMetadata(jid);
          Logger.info(`[OutboundHandler] Fetched group metadata for ${jid} before sending.`);
        } catch (err) {
          Logger.warn(`[OutboundHandler] Failed to fetch group metadata for ${jid} before sending:`, err);
        }
      }

      const sentMsg = await sock.sendMessage(
        jid,
        { text: content },
        {
          messageId: generatedId,
          quoted: quotedMsg,
        },
      );

      // [SEC] DEDUP FIX: Also mark the FINAL Baileys ID to prevent echo processing.
      // Baileys may use a different ID than the one we generated.
      const finalBaileysId = sentMsg?.key?.id;
      if (finalBaileysId && finalBaileysId !== generatedId) {
        await deduplicationService.markMessageSent(finalBaileysId);
      }

      const mergedMeta: MessageMetadata = {
        messageId: sentMsg?.key?.id,
        ...metadata,
      };

      const dbId = metadata?.dbId as string | undefined;
      let savedMessage;

      if (dbId) {
        savedMessage = await messageRepository.update(dbId, {
          whatsappMessageId: sentMsg?.key?.id || generatedId,
          status: "SENT",
          metadata: prepareMetadataForDB(mergedMeta) as Prisma.InputJsonValue,
        });
      } else {
        savedMessage = await chatService.upsertMessage({
          whatsappMessageId: sentMsg?.key?.id || `temp_${Date.now()}`,
          companyId,
          content,
          direction: "OUTBOUND",
          conversationId,
          senderId,
          status: "SENT",
          metadata: prepareMetadataForDB(mergedMeta),
        });
      }

      const isAiGenerated = metadata?.aiGenerated === true;
      const isFlowGenerated = metadata?.flowGenerated === true;

      if (!isAiGenerated && !isFlowGenerated) {
        try {
          await chatService.updateConversation(companyId, conversationId, {
            aiEnabled: false,
            lastManualIntervention: new Date(),
          });
          Logger.info(
            `[HITL] [OK] AI muted for conversation ${conversationId} (human agent intervention)`,
          );
        } catch (err) {
          Logger.error("[HITL] Failed to auto-mute AI:", err);
        }
      } else {
        Logger.info(
          `[HITL] ⏩ Skipping AI mute - message is ${
            isAiGenerated ? "AI-generated" : "Flow-generated"
          }`,
        );
      }

      // Restore socket emission so frontend gets final Baileys ID for read receipts.
      // Frontend dedupe has been fixed to prevent duplicates when this arrives.
      await chatService.updateConversation(companyId, conversationId, {});
      const fullConv = await chatService.getFullConversation(
        companyId,
        conversationId,
      );
      if (fullConv) {
        // Emit socket so UI updates from temp_ ID to real Baileys ID
        try {
          const { gateway } = await import("@/gateways/socketGateway");
          const { SocketEventEmitter } =
            await import("@/services/SocketEventEmitter");
          const socketEmitter = new SocketEventEmitter(gateway);

          type Emits = InstanceType<
            typeof import("@/services/SocketEventEmitter").SocketEventEmitter
          >["emitMessageSent"];
          socketEmitter.emitMessageSent(
            savedMessage as Parameters<Emits>[0],
            fullConv as Parameters<Emits>[1],
          );
        } catch (err: unknown) {
          Logger.warn("[OutboundHandler] Failed to emit socket", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return this.mapToMessagePayload(savedMessage as Message & { whatsappMessageId: string | null }, activeSession.sessionId, to);
    } catch (err: unknown) {
      Logger.error("[MessageHandler] [ERROR] sendMessage failed:", err);
      throw err;
    }
  }

  // ────────────────────────────────────────────────
  // SEND MEDIA
  // ────────────────────────────────────────────────

  async sendMedia(
    to: string,
    media: MediaPayload,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { companyId, conversationId, senderId } = options;

    let tempFilePath: string | null = null;
    try {
      const activeSession =
        await this.sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        throw new Error(`No active WhatsApp session for company: ${companyId}`);
      }
      const sock = activeSession.socket;
      // [SEC] CRITICAL FIX: Use WhatsAppIdUtils to properly detect groups vs DMs, with LID resolution fallback
      const jid = await this.resolveDestinationJid(to, companyId, activeSession.sessionId);

      // [BUILD] SRP: All media preparation delegated to MediaProcessorService
      Logger.debug(`[OutboundHandler] Preparing media for ${jid}: type=${media.type}, url=${media.url?.substring(0, 50)}...`);
      const prepared = await mediaProcessor.prepareOutboundContent(media);
      const { content: messageContent, metaType } = prepared;
      tempFilePath = prepared.tempFilePath;
      
      const hasAudio = typeof messageContent === 'object' && messageContent !== null && 'audio' in messageContent;
      Logger.debug(`[OutboundHandler] Preparation complete: metaType=${metaType}, hasBuffer=${hasAudio}, hasTempFile=${!!tempFilePath}`);

      const generatedId =
        (options.metadata?.generatedMessageId as string) || generateMessageID();
      await deduplicationService.markMessageSent(generatedId);

      // [SYNC] RESOLVE QUOTED (MEDIA)
      let quotedMsg;
      if (options.quotedMessageId) {
        const dbQuoted = await messageRepository.findFirst({
          where: { id: options.quotedMessageId, companyId },
        });
        if (dbQuoted && dbQuoted.whatsappMessageId) {
          const isGroup = jid.endsWith("@g.us");
          const participant = dbQuoted.direction === "INBOUND" && isGroup
            ? ((dbQuoted.metadata as Prisma.JsonObject)?.senderJid as string | undefined) 
            : undefined;

          // [SEC] CRITICAL FIX: WhatsApp silently drops group messages if they quote a message
          // but lack the 'participant' field. If we don't have the senderJid, we MUST omit the quote!
          if (isGroup && dbQuoted.direction === "INBOUND" && !participant) {
            Logger.warn(`[OutboundHandler] Missing senderJid for quoted group message. Dropping quote to ensure delivery.`);
          } else {
            quotedMsg = {
              key: {
                remoteJid: jid,
                fromMe: dbQuoted.direction === "OUTBOUND",
                id: dbQuoted.whatsappMessageId,
                participant: participant,
              },
              message: {
                conversation:
                  (options.metadata?.quotedContent as string) ||
                  dbQuoted.content ||
                  "Original message",
              },
            };
          }
        }
      }

      // [SEC] ENTERPRISE FIX: Ensure Baileys has the group metadata cached before sending.
      // If the backend was restarted, Baileys' in-memory store forgets the participants.
      // Without participants, Baileys cannot distribute the Sender Key, causing WhatsApp to silently drop the message!
      if (jid.endsWith("@g.us")) {
        try {
          await sock.groupMetadata(jid);
          Logger.info(`[OutboundHandler] Fetched group metadata for ${jid} before sending media.`);
        } catch (err) {
          Logger.warn(`[OutboundHandler] Failed to fetch group metadata for ${jid} before sending media:`, err);
        }
      }

      const sentMsg = await sock.sendMessage(jid, messageContent, {
        messageId: generatedId,
        quoted: quotedMsg,
      });

      Logger.info(`[OutboundHandler] Baileys sentMsg result for ${generatedId}: ${!!sentMsg}`);

      // [SEC] DEDUP FIX: Also mark the FINAL Baileys ID for media messages.
      const finalMediaId = sentMsg?.key?.id;
      if (finalMediaId && finalMediaId !== generatedId) {
        await deduplicationService.markMessageSent(finalMediaId);
      }
      const content = media.caption || getMediaPlaceholder(media.type);

      const meta: MessageMetadata = {
        messageId: sentMsg?.key?.id,
        media: { type: metaType, url: media.url },
        ...(options.metadata || {}), // ️ FIX: Preserve quotes/replies metadata
      };

      const dbId = options.metadata?.dbId as string | undefined;
      let savedMessage;

      if (dbId) {
        savedMessage = await messageRepository.update(dbId, {
          whatsappMessageId: sentMsg?.key?.id || generatedId,
          status: "SENT",
          metadata: prepareMetadataForDB(meta) as Prisma.InputJsonValue,
        });
      } else {
        savedMessage = await chatService.upsertMessage({
          whatsappMessageId: sentMsg?.key?.id || `temp_${Date.now()}`,
          companyId,
          content,
          direction: "OUTBOUND",
          conversationId,
          senderId,
          status: "SENT",
          metadata: prepareMetadataForDB(meta),
        });
      }

      const optMetadata = options.metadata;
      const isAiGenerated = optMetadata?.aiGenerated === true;
      const isFlowGenerated = optMetadata?.flowGenerated === true;

      if (!isAiGenerated && !isFlowGenerated) {
        try {
          await chatService.updateConversation(companyId, conversationId, {
            aiEnabled: false,
            lastManualIntervention: new Date(),
          });
          Logger.info(
            `[HITL] [OK] AI muted for conversation ${conversationId} (human agent sent media)`,
          );
        } catch (err) {
          Logger.error("[HITL] Failed to auto-mute AI:", err);
        }
      } else {
        Logger.info(
          `[HITL] ⏩ Skipping AI mute for media - ${
            isAiGenerated ? "AI-generated" : "Flow-generated"
          }`,
        );
      }

      // Restore socket emission for media messages
      await chatService.updateConversation(companyId, conversationId, {});
      const fullConv = await chatService.getFullConversation(
        companyId,
        conversationId,
      );
      if (fullConv) {
        try {
          const { gateway } = await import("@/gateways/socketGateway");
          const { SocketEventEmitter } =
            await import("@/services/SocketEventEmitter");
          const socketEmitter = new SocketEventEmitter(gateway);
          type Emits = InstanceType<
            typeof import("@/services/SocketEventEmitter").SocketEventEmitter
          >["emitMessageSent"];
          socketEmitter.emitMessageSent(
            savedMessage as Parameters<Emits>[0],
            fullConv as Parameters<Emits>[1],
          );
        } catch (err: unknown) {
          Logger.warn("[OutboundHandler] Failed to emit socket", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return this.mapToMessagePayload(savedMessage as Message & { whatsappMessageId: string | null }, activeSession.sessionId, to);
    } catch (err: unknown) {
      // [SEC] Handle MediaFileNotFoundError gracefully
      if (err instanceof MediaFileNotFoundError) {
        Logger.error(`[MessageHandler] [ERROR] ${err.message}`);
        const warningContent = err.caption
          ? `${err.caption}\n\n([WARNING] Audio unavailable: File not found on server)`
          : `([WARNING] Audio unavailable: File not found on server)`;
        return this.sendMessage(to, warningContent, options);
      }

      Logger.error(`[MessageHandler] [ERROR] sendMedia failed unexpectedly:`, err);
      throw err;
    } finally {
      if (tempFilePath) {
        cleanupTempFile(tempFilePath).catch((err) =>
          Logger.warn(
            `[MessageHandler] Cleanup failed for ${tempFilePath}:`,
            err,
          ),
        );
      }
    }
  }

  // ────────────────────────────────────────────────
  // MARK AS READ
  // ────────────────────────────────────────────────

  async markAsRead(messageId: string, sessionId: string): Promise<void> {
    const sock = this.sessionManager.getSession(sessionId);
    if (!sock) return;

    const session =
      await whatsappSessionRepository.findSystemSession(sessionId);
    if (!session) return;

    await TenantContextManager.run(
      { companyId: session.companyId, requestId: `read:${messageId}` },
      async () => {
        const msg = await messageRepository.findWithConversation(
          session.companyId,
          messageId,
        );

        if (msg && msg.metadata) {
          const meta = msg.metadata as Record<
            string,
            Prisma.JsonValue | undefined
          >;
          const remoteMessageId = meta.messageId as string | undefined;
          let remoteJid = msg.conversation?.channelId;
          if (remoteJid && !remoteJid.includes("@"))
            remoteJid = WhatsAppIdUtils.getTargetJid(remoteJid);

          if (remoteMessageId && remoteJid) {
            await sock.readMessages([
              { remoteJid, id: remoteMessageId, participant: undefined },
            ]);
          }
        }
      },
    );
  }

  // ────────────────────────────────────────────────
  // PRESENCE UPDATE (Send)
  // ────────────────────────────────────────────────

  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    try {
      const activeSession =
        await this.sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) return;

      const sock = activeSession.socket;
      if (!sock) return;

      const jid = await this.resolveDestinationJid(to, companyId, activeSession.sessionId);

      await sock.sendPresenceUpdate(type, jid).catch((err) => {
        Logger.warn(`[Presence] Failed to send ${type} to ${jid}`, err);
      });
    } catch (error) {
      Logger.warn(`[Presence] Error in sendPresenceUpdate:`, error);
    }
  }

  async sendReaction(
    to: string,
    messageId: string,
    reaction: string,
    companyId: string,
    fromMe: boolean = false,
  ): Promise<void> {
    try {
      const activeSession =
        await this.sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) return;

      const sock = activeSession.socket;
      if (!sock) return;

      const jid = await this.resolveDestinationJid(to, companyId, activeSession.sessionId);

      await sock.sendMessage(jid, {
        react: {
          text: reaction,
          key: {
            remoteJid: jid,
            fromMe: fromMe, // [DEV] DYNAMIC: Support reacting to both customer and agent messages
            id: messageId,
          },
        },
      });

      Logger.debug(`[Reaction] Sent reaction ${reaction} to ${messageId}`);
    } catch (error) {
      Logger.warn(
        `[Reaction] Failed to send reaction: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
