import { ISessionManager } from "../../core/interfaces/ISessionManager";
import {
  SendMessageOptions,
  MediaPayload,
  MessagePayload,
} from "../../core/types/whatsapp.types";
import { MessageMetadata } from "@/types/whatsapp.types";
import { generateMessageID } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { deduplicationService } from "../../services/DeduplicationService";
import { chatService } from "@/services/chatService";
import { cleanupTempFile } from "@/utils/audioConverter";
import {
  mediaProcessor,
  MediaFileNotFoundError,
} from "../../services/MediaProcessorService";
import { SocketEventEmitter } from "@/services/socketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { TenantContextManager } from "@/config/tenantContext";
import { Prisma } from "@prisma/client";

const prepareMetadataForDB = (meta: MessageMetadata): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(meta));
};

export class OutboundMessageHandler {
  private socketEmitter: SocketEventEmitter;

  constructor(private sessionManager: ISessionManager) {
    this.socketEmitter = new SocketEventEmitter(gateway);
  }
  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
    retries = 3,
  ): Promise<MessagePayload> {
    const { companyId, conversationId, senderId, metadata } = options;

    try {
      const activeSession =
        await this.sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        throw new Error(`No active WhatsApp session for company: ${companyId}`);
      }
      const sock = activeSession.socket;

      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
      const generatedId = generateMessageID();
      await deduplicationService.markMessageSent(generatedId);

      await deduplicationService.markContentSent(conversationId, content);

      const sentMsg = await sock.sendMessage(
        jid,
        { text: content },
        {
          messageId: generatedId,
          quoted: options.quotedMessageId
            ? {
                key: {
                  remoteJid: jid,
                  id: options.quotedMessageId,
                },
                message: {
                  conversation:
                    (metadata?.quotedContent as string) || "Mensaje original",
                },
              }
            : undefined,
        },
      );

      const mergedMeta: MessageMetadata = {
        messageId: sentMsg?.key?.id,
        ...metadata,
      };

      const savedMessage = await chatService.upsertMessage({
        whatsappMessageId: sentMsg?.key?.id || `temp_${Date.now()}`,
        companyId,
        content,
        direction: "OUTBOUND",
        conversationId,
        senderId,
        status: "SENT",
        metadata: prepareMetadataForDB(mergedMeta),
      });

      const isAiGenerated = metadata?.aiGenerated === true;
      const isFlowGenerated = metadata?.flowGenerated === true;

      if (!isAiGenerated && !isFlowGenerated) {
        try {
          await chatService.updateConversation(conversationId, {
            aiEnabled: false,
            lastManualIntervention: new Date(),
          });
          Logger.info(
            `[HITL] ✅ AI muted for conversation ${conversationId} (human agent intervention)`,
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

      await chatService.updateConversation(conversationId, {});
      const fullConv = await chatService.getFullConversation(conversationId);
      if (fullConv) this.socketEmitter.emitMessageSent(savedMessage, fullConv);

      return savedMessage as unknown as MessagePayload;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
      const isConnectionError =
        errorMsg.includes("Connection Closed") ||
        errorMsg.includes("Precondition Required") ||
        errorMsg.includes("Bad MAC") ||
        errorMsg.includes("Timed Out");

      if (isConnectionError && retries > 0) {
        Logger.warn(
          `[MessageHandler] ⚠️ Send failed (${errorMsg}). Retrying in 2s... (${retries} left)`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.sendMessage(to, content, options, retries - 1);
      }

      Logger.error("[MessageHandler] ❌ sendMessage failed final:", err);
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
    retries = 3,
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
      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

      // 🏗️ SRP: All media preparation delegated to MediaProcessorService
      const prepared = await mediaProcessor.prepareOutboundContent(media);
      const { content: messageContent, metaType } = prepared;
      tempFilePath = prepared.tempFilePath;

      const generatedId = generateMessageID();
      await deduplicationService.markMessageSent(generatedId);

      const sentMsg = await sock.sendMessage(jid, messageContent, {
        messageId: generatedId,
        quoted: options.quotedMessageId
          ? {
              key: {
                remoteJid: jid,
                id: options.quotedMessageId,
              },
              message: {
                conversation:
                  (options.metadata?.quotedContent as string) ||
                  "Media original",
              },
            }
          : undefined,
      });
      const content = media.caption || `[${media.type}]`;

      const meta: MessageMetadata = {
        messageId: sentMsg?.key?.id,
        media: { type: metaType, url: media.url },
      };

      const savedMessage = await chatService.upsertMessage({
        whatsappMessageId: sentMsg?.key?.id || `temp_${Date.now()}`,
        companyId,
        content,
        direction: "OUTBOUND",
        conversationId,
        senderId,
        status: "SENT",
        metadata: prepareMetadataForDB(meta),
      });

      const optMetadata = options.metadata;
      const isAiGenerated = optMetadata?.aiGenerated === true;
      const isFlowGenerated = optMetadata?.flowGenerated === true;

      if (!isAiGenerated && !isFlowGenerated) {
        try {
          await chatService.updateConversation(conversationId, {
            aiEnabled: false,
            lastManualIntervention: new Date(),
          });
          Logger.info(
            `[HITL] ✅ AI muted for conversation ${conversationId} (human agent sent media)`,
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

      await chatService.updateConversation(conversationId, {});
      const fullConv = await chatService.getFullConversation(conversationId);
      if (fullConv) this.socketEmitter.emitMessageSent(savedMessage, fullConv);

      return savedMessage as unknown as MessagePayload;
    } catch (err: unknown) {
      // 🛡️ Handle MediaFileNotFoundError gracefully
      if (err instanceof MediaFileNotFoundError) {
        Logger.error(`[MessageHandler] ❌ ${err.message}`);
        const warningContent = err.caption
          ? `${err.caption}\n\n(⚠️ Audio no disponible: Archivo no encontrado en el servidor)`
          : `(⚠️ Audio no disponible: Archivo no encontrado en el servidor)`;
        return this.sendMessage(to, warningContent, options);
      }

      const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
      const isConnectionError =
        errorMsg.includes("Connection Closed") ||
        errorMsg.includes("Precondition Required") ||
        errorMsg.includes("Bad MAC") ||
        errorMsg.includes("Timed Out");

      if (isConnectionError && retries > 0) {
        Logger.warn(
          `[MessageHandler] ⚠️ SendMedia failed (${errorMsg}). Retrying in 2s... (${retries} left)`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (tempFilePath) {
          try {
            await cleanupTempFile(tempFilePath);
            tempFilePath = null;
          } catch (cleanupErr) {
            Logger.warn(
              "[MessageHandler] ⚠️ Temp file cleanup failed during retry:",
              cleanupErr,
            );
          }
        }
        return this.sendMedia(to, media, options, retries - 1);
      }

      Logger.error(`[MessageHandler] ❌ sendMedia failed unexpectedly:`, err);
      const warningContent = `(⚠️ Error enviando archivo multimedia: ${media.type})`;
      return this.sendMessage(to, warningContent, options);
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

    const session = await whatsappSessionRepository.findOne(sessionId);
    if (!session) return;

    await TenantContextManager.run(
      { companyId: session.companyId, requestId: `read:${messageId}` },
      async () => {
        const msg = await messageRepository.findWithConversation(messageId);

        if (msg && msg.metadata) {
          const meta = msg.metadata as unknown as MessageMetadata;
          let remoteJid = msg.conversation?.channelId;
          if (remoteJid && !remoteJid.includes("@"))
            remoteJid += "@s.whatsapp.net";

          if (meta.messageId && remoteJid) {
            await sock.readMessages([
              { remoteJid, id: meta.messageId, participant: undefined },
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

      let jid = to;
      if (!to.includes("@")) {
        const cleanPhone = to.replace(/\D/g, "");
        jid = `${cleanPhone}@s.whatsapp.net`;
      }

      await sock.sendPresenceUpdate(type, jid).catch((err) => {
        Logger.warn(`[Presence] Failed to send ${type} to ${jid}`, err);
      });
    } catch (error) {
      Logger.warn(`[Presence] Error in sendPresenceUpdate:`, error);
    }
  }
}
