import { ISessionManager } from "../../core/interfaces/ISessionManager";
import {
  SendMessageOptions,
  MediaPayload,
  MessagePayload,
} from "../../core/types/whatsapp.types";
import { MessageMetadata } from "@/types/whatsapp.types";
import { generateMessageID, ChatModification } from "@whiskeysockets/baileys";
import { WhatsAppIdUtils } from "../../utils/WhatsAppIdUtils";
import { Logger } from "@/utils/logger";
import { deduplicationService } from "../../services/DeduplicationService";
import { cleanupTempFile } from "@/utils/audioConverter";
import {
  mediaProcessor,
  MediaFileNotFoundError,
} from "../../services/MediaProcessorService";
import { getMediaPlaceholder } from "@/utils/mediaUtils";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { TenantContextManager } from "@/config/tenantContext";
import { Prisma, Message } from "@prisma/client";
import { OutboundJidResolver } from "./OutboundJidResolver";
import { OutboundMessageHelper } from "./OutboundMessageHelper";
import { messageRepository } from "@/repositories/MessageRepository";

export class OutboundMessageHandler {
  private socketEmitter: SocketEventEmitter;
  private jidResolver: OutboundJidResolver;
  private helper: OutboundMessageHelper;

  constructor(private sessionManager: ISessionManager) {
    this.socketEmitter = new SocketEventEmitter(gateway);
    this.jidResolver = new OutboundJidResolver(sessionManager);
    this.helper = new OutboundMessageHelper(this.socketEmitter);
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

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { companyId, conversationId: originalConversationId, senderId, metadata } = options;

    try {
      const conversationId = await this.helper.resolveConversationId(originalConversationId, companyId);

      const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        throw new Error(`No active WhatsApp session for company: ${companyId}`);
      }
      const sock = activeSession.socket;

      const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);
      const generatedId = (metadata?.generatedMessageId as string) || generateMessageID();
      await deduplicationService.markMessageSent(generatedId);
      await deduplicationService.markContentSent(conversationId, content);

      const quotedMsg = await this.helper.resolveQuotedMessage(options, jid, conversationId);

      await this.helper.ensureGroupMetadata(sock, jid);

      const sentMsg = await sock.sendMessage(
        jid,
        { text: content },
        {
          messageId: generatedId,
          quoted: quotedMsg,
        },
      );

      const savedMessage = await this.helper.handlePostSend({
        companyId,
        conversationId,
        senderId,
        content,
        sentMsgId: sentMsg?.key?.id,
        generatedId,
        metadata,
        dbId: metadata?.dbId as string | undefined,
      });

      return this.mapToMessagePayload(
        savedMessage as Message & { whatsappMessageId: string | null },
        activeSession.sessionId,
        to
      );
    } catch (err: unknown) {
      Logger.error("[MessageHandler] [ERROR] sendMessage failed:", err);
      throw err;
    }
  }

  async sendMedia(
    to: string,
    media: MediaPayload,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { companyId, conversationId: originalConversationId, senderId } = options;

    let tempFilePath: string | null = null;
    try {
      const conversationId = await this.helper.resolveConversationId(originalConversationId, companyId);

      const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        throw new Error(`No active WhatsApp session for company: ${companyId}`);
      }
      const sock = activeSession.socket;
      const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);

      Logger.debug(`[OutboundHandler] Preparing media for ${jid}: type=${media.type}, url=${media.url?.substring(0, 50)}...`);
      const prepared = await mediaProcessor.prepareOutboundContent(media);
      const { content: messageContent, metaType } = prepared;
      tempFilePath = prepared.tempFilePath;
      
      const hasAudio = typeof messageContent === 'object' && messageContent !== null && 'audio' in messageContent;
      Logger.debug(`[OutboundHandler] Preparation complete: metaType=${metaType}, hasBuffer=${hasAudio}, hasTempFile=${!!tempFilePath}`);

      const generatedId = (options.metadata?.generatedMessageId as string) || generateMessageID();
      await deduplicationService.markMessageSent(generatedId);

      const mediaPlaceholder = media.caption || getMediaPlaceholder(media.type);
      await deduplicationService.markContentSent(conversationId, mediaPlaceholder);

      const quotedMsg = await this.helper.resolveQuotedMessage(options, jid, conversationId);

      await this.helper.ensureGroupMetadata(sock, jid);

      const sentMsg = await sock.sendMessage(jid, messageContent, {
        messageId: generatedId,
        quoted: quotedMsg,
      });

      Logger.info(`[OutboundHandler] Baileys sentMsg result for ${generatedId}: ${!!sentMsg}`);

      const content = media.caption || getMediaPlaceholder(media.type);
      const meta: MessageMetadata = {
        messageId: sentMsg?.key?.id,
        media: { type: metaType, url: media.url },
        // Location/contact carry no real URL — persist the actual structured
        // data so the frontend can render a map link / contact card.
        ...(media.location ? { location: media.location } : {}),
        ...(media.contact ? { contact: media.contact } : {}),
        ...(options.metadata || {}),
      };

      const savedMessage = await this.helper.handlePostSend({
        companyId,
        conversationId,
        senderId,
        content,
        sentMsgId: sentMsg?.key?.id,
        generatedId,
        metadata: meta,
        dbId: options.metadata?.dbId as string | undefined,
      });

      return this.mapToMessagePayload(
        savedMessage as Message & { whatsappMessageId: string | null },
        activeSession.sessionId,
        to
      );
    } catch (err: unknown) {
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
          Logger.warn(`[MessageHandler] Cleanup failed for ${tempFilePath}:`, err)
        );
      }
    }
  }

  async markAsRead(messageId: string, sessionId: string): Promise<void> {
    const sock = this.sessionManager.getSession(sessionId);
    if (!sock) return;

    const session = await whatsappSessionRepository.findSystemSession(sessionId);
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

  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    try {
      const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) return;

      const sock = activeSession.socket;
      if (!sock) return;

      const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);

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
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }

    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }

    const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);

    try {
      // [SEC] 100-YEAR FIX: baileys-antiban's wrapped sendMessage reads
      // `options.circuitBreaker` unconditionally (wrapper.js) — calling
      // sendMessage with only 2 args left `options` as `undefined` and threw
      // "Cannot read properties of undefined (reading 'circuitBreaker')" on
      // every single reaction, silently swallowed by the old catch below.
      // A 3rd arg (even empty) is required, matching the normal text-send call.
      await sock.sendMessage(
        jid,
        {
          react: {
            text: reaction,
            key: {
              remoteJid: jid,
              fromMe: fromMe,
              id: messageId,
            },
          },
        },
        {},
      );

      Logger.debug(`[Reaction] Sent reaction "${reaction}" to ${messageId} (jid=${jid}, fromMe=${fromMe})`);
    } catch (error) {
      // [SEC] 100-YEAR FIX: Previously this error was swallowed here, so the caller
      // (ConversationMessageService.reactToMessage) always proceeded to update the DB
      // and emit the socket event as if the reaction had been delivered — the CRM
      // showed the reaction while WhatsApp silently never received it. Re-throw so
      // the caller can abort the DB write and surface a real error to the agent.
      Logger.error(
        `[Reaction] Failed to send reaction "${reaction}" to ${messageId} (jid=${jid}, fromMe=${fromMe}): ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  async editOutboundMessage(
    to: string,
    messageId: string,
    newContent: string,
    companyId: string,
  ): Promise<void> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }

    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }

    const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);

    try {
      // Same baileys-antiban 3rd-arg quirk as sendReaction above — the wrapper
      // reads options.circuitBreaker unconditionally, so it can't be omitted.
      await sock.sendMessage(
        jid,
        {
          text: newContent,
          edit: { remoteJid: jid, fromMe: true, id: messageId },
        },
        {},
      );
      Logger.debug(`[EditMessage] Edited ${messageId} (jid=${jid})`);
    } catch (error) {
      Logger.error(
        `[EditMessage] Failed to edit ${messageId} (jid=${jid}): ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  async revokeOutboundMessage(
    to: string,
    messageId: string,
    companyId: string,
  ): Promise<void> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }

    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }

    const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);

    try {
      await sock.sendMessage(
        jid,
        { delete: { remoteJid: jid, fromMe: true, id: messageId } },
        {},
      );
      Logger.debug(`[RevokeMessage] Revoked ${messageId} (jid=${jid})`);
    } catch (error) {
      Logger.error(
        `[RevokeMessage] Failed to revoke ${messageId} (jid=${jid}): ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Pin/unpin a message "for everyone" in the chat (the banner-at-top feature).
   * Works on any message regardless of direction, so `fromMe` must reflect the
   * original message's direction. Baileys PinInChat.Type: 1 = pin, 2 = unpin;
   * `time` is the pin duration (7 days here, matching WhatsApp's default).
   */
  async pinMessage(
    to: string,
    messageId: string,
    fromMe: boolean,
    pin: boolean,
    companyId: string,
  ): Promise<void> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }

    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }

    const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);

    try {
      await sock.sendMessage(
        jid,
        {
          pin: { remoteJid: jid, fromMe, id: messageId },
          type: pin ? 1 : 2, // proto.PinInChat.Type: PIN_FOR_ALL / UNPIN_FOR_ALL
          time: 604800, // 7 days
        },
        {},
      );
      Logger.debug(`[PinMessage] ${pin ? "Pinned" : "Unpinned"} ${messageId} (jid=${jid})`);
    } catch (error) {
      Logger.error(
        `[PinMessage] Failed to ${pin ? "pin" : "unpin"} ${messageId} (jid=${jid}): ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  async updateBlockStatus(
    to: string,
    action: "block" | "unblock",
    companyId: string,
  ): Promise<void> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }

    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }

    const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);

    try {
      await sock.updateBlockStatus(jid, action);
      Logger.info(`[Block] ${action === "block" ? "Blocked" : "Unblocked"} ${jid} (companyId=${companyId})`);
    } catch (error) {
      Logger.error(
        `[Block] Failed to ${action} ${jid} (companyId=${companyId}): ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Mirrors a CRM-side inbox action (archive/pin/mute) onto the real WhatsApp
   * account via Baileys' chatModify. Callers building a `lastMessages` array
   * (required by the `archive` modification) can omit `key.remoteJid` — it's
   * unknown at the service layer until JID resolution happens here, so it's
   * filled in below before dispatch.
   */
  async modifyChat(
    to: string,
    companyId: string,
    mod: ChatModification,
  ): Promise<void> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }

    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }

    const jid = await this.jidResolver.resolveDestinationJid(to, companyId, activeSession.sessionId);
    const resolvedMod = this.injectJidIntoLastMessages(mod, jid);

    try {
      await sock.chatModify(resolvedMod, jid);
      Logger.info(`[ChatModify] Applied ${JSON.stringify(mod).slice(0, 80)} to ${jid} (companyId=${companyId})`);
    } catch (error) {
      Logger.error(
        `[ChatModify] Failed to apply chat modification to ${jid} (companyId=${companyId}): ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  async updateOwnProfileName(companyId: string, name: string): Promise<void> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }
    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }

    try {
      await sock.updateProfileName(name);
      Logger.info(`[Profile] Updated WhatsApp profile name for company ${companyId}`);
    } catch (error) {
      Logger.error(
        `[Profile] Failed to update profile name for company ${companyId}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  async updateOwnProfilePicture(companyId: string, imageUrl: string): Promise<void> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }
    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }
    const ownJid = sock.user?.id;
    if (!ownJid) {
      throw new Error(`Session ${activeSession.sessionId} has no resolved own JID yet`);
    }

    try {
      await sock.updateProfilePicture(ownJid, { url: imageUrl });
      Logger.info(`[Profile] Updated WhatsApp profile picture for company ${companyId}`);
    } catch (error) {
      Logger.error(
        `[Profile] Failed to update profile picture for company ${companyId}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  private injectJidIntoLastMessages(mod: ChatModification, jid: string): ChatModification {
    if ("lastMessages" in mod && Array.isArray(mod.lastMessages)) {
      return {
        ...mod,
        lastMessages: mod.lastMessages.map((m) => ({
          ...m,
          key: { ...m.key, remoteJid: m.key?.remoteJid || jid },
        })),
      } as ChatModification;
    }
    return mod;
  }
}
