import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import {
  MessagePayload,
  SendMessageOptions,
  MediaPayload,
} from "../core/types/whatsapp.types";
import { EventBus } from "../core/events/EventBus";
import {
  WhatsAppEventType,
  WhatsAppEventData,
} from "../core/events/WhatsAppEvents";
import { prisma } from "@/config/database";
import {
  WAMessage,
  WAMessageUpdate,
  generateMessageID,
} from "@whiskeysockets/baileys";
import { gateway } from "@/gateways/socketGateway";
import { TenantContextManager } from "@/config/tenantContext";
import { SocketEventEmitter } from "@/services/socketEventEmitter";
import { cleanupTempFile } from "@/utils/audioConverter";
import { WhatsAppIdUtils } from "../utils/WhatsAppIdUtils";

import { chatService } from "@/services/chatService";
import { SessionData, MessageMetadata } from "@/types/whatsapp.types";
import { Conversation, Queue, MediaType, Prisma, User } from "@prisma/client";

// 🏗️ SRP SERVICES (Extracted from this file)
import { IdentityResolverService } from "../services/IdentityResolverService";
import { AITriggerService } from "../services/AITriggerService";
import { ProfilePictureService } from "../services/ProfilePictureService";
import {
  mediaProcessor,
  MediaFileNotFoundError,
} from "../services/MediaProcessorService";
import { Logger } from "@/utils/logger";

type ConversationWithQueue = Conversation & {
  queue: (Queue & { aiAssistantId: string | null }) | null;
  participants: User[];
  assignedTo: User | null;
};

const prepareMetadataForDB = (meta: MessageMetadata): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(meta));
};

/**
 * 🏗️ MESSAGE HANDLER (Refactored Orchestrator)
 *
 * Responsibilities: Event subscription, message routing, send/receive orchestration.
 * Delegated: IdentityResolverService (LID resolution)
 * Delegated: AITriggerService (Flow Bot + AI responses)
 * Delegated: ProfilePictureService (avatar management)
 *
 * Target: < 500 lines ✅
 */
export class MessageHandler implements IMessageHandler {
  private eventBus: EventBus;
  private sessionCache = new Map<string, SessionData>();
  private conversionQueues = new Map<string, Promise<void>>();
  private recentSentMessageIds = new Set<string>();
  private recentSentContent = new Set<string>();
  private socketEmitter: SocketEventEmitter;

  // 🏗️ SRP: Delegated services
  private identityResolver: IdentityResolverService;
  private aiTrigger: AITriggerService;
  private profilePicService: ProfilePictureService;

  constructor(private sessionManager: ISessionManager) {
    this.eventBus = EventBus.getInstance();
    this.socketEmitter = new SocketEventEmitter(gateway);

    // Initialize SRP services
    this.identityResolver = new IdentityResolverService(sessionManager);
    this.profilePicService = new ProfilePictureService(sessionManager);
    this.aiTrigger = new AITriggerService({
      sendMessage: (to, content, options) =>
        this.sendMessage(to, content, options),
      sendMedia: (to, media, options) =>
        this.sendMedia(to, media as MediaPayload, options),
      sendPresenceUpdate: (to, type, companyId) =>
        this.sendPresenceUpdate(to, type, companyId),
    });

    this.subscribeToEvents();
  }

  private async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.conversionQueues.get(key) || Promise.resolve();

    const resultPromise = previous
      .then(() => task())
      .catch((err) => {
        Logger.error(`[Mutex] Critical task failure for ${key}:`, err);
        throw err;
      });

    const signalPromise = resultPromise.then(() => {}).catch(() => {});

    this.conversionQueues.set(key, signalPromise);

    signalPromise.then(() => {
      if (this.conversionQueues.get(key) === signalPromise) {
        this.conversionQueues.delete(key);
      }
    });

    return resultPromise;
  }

  private subscribeToEvents(): void {
    this.eventBus.subscribe(
      WhatsAppEventType.MESSAGE_RECEIVED,
      async (event) => {
        await this.handleIncoming(event.data.message, event.sessionId);
      },
    );

    this.eventBus.subscribe(WhatsAppEventType.MESSAGE_UPDATE, async (event) => {
      await this.handleMessageUpdate(
        event.data.messageId,
        event.data.update,
        event.sessionId,
      );
    });

    this.eventBus.subscribe(
      WhatsAppEventType.PRESENCE_UPDATE,
      async (event) => {
        await this.handlePresenceUpdate(event.data, event.sessionId);
      },
    );
  }

  // ────────────────────────────────────────────────
  // PRESENCE UPDATE (Delegated to IdentityResolver)
  // ────────────────────────────────────────────────

  async handlePresenceUpdate(
    data: WhatsAppEventData[WhatsAppEventType.PRESENCE_UPDATE],
    sessionId: string,
  ): Promise<void> {
    const { id: remoteJid, presences } = data;
    if (!remoteJid || !presences) return;

    const participant = Object.keys(presences)[0];
    if (!participant) return;

    const presence = presences[participant];
    const status = (presence.lastKnownPresence || "paused") as
      | "composing"
      | "recording"
      | "paused";

    Logger.info(`[Presence] 📥 Event from ${remoteJid}: ${status}`);

    const sessionData = await this.ensureSessionData(sessionId);
    if (!sessionData) {
      Logger.warn(`[Presence] ⚠️ SessionData missing for ${sessionId}`);
      return;
    }

    await TenantContextManager.run(
      {
        companyId: sessionData.companyId,
        userId: "system",
        requestId: `presence:${remoteJid}`,
      },
      async () => {
        const originalJid = WhatsAppIdUtils.getCleanJid(remoteJid);
        const targetJid = await this.identityResolver.resolvePresenceJid(
          originalJid,
          sessionId,
        );

        const chatUniqueId = targetJid.split("@")[0];

        let conv = await chatService.findConversation(
          sessionData.companyId,
          chatUniqueId,
          `${chatUniqueId}@whatsapp.user`,
        );

        if (!conv && targetJid !== originalJid) {
          Logger.warn(
            `[Presence] ⚠️ Phone lookup failed for ${targetJid}, trying LID fallback...`,
          );
          const fallbackId = originalJid.split("@")[0];
          conv = await chatService.findConversation(
            sessionData.companyId,
            fallbackId,
            `${fallbackId}@whatsapp.user`,
          );
        }

        if (conv) {
          Logger.info(`[Presence] 📡 Emitting ${status} to Chat ${conv.id}`);
          this.socketEmitter.emitConversationTyping(
            conv.id,
            sessionData.companyId,
            targetJid,
            status,
          );
        } else {
          Logger.warn(
            `[Presence] ❌ Conversation NOT FOUND. Original: ${originalJid}, Target: ${targetJid}, Company: ${sessionData.companyId}`,
          );
        }
      },
    );
  }

  // ────────────────────────────────────────────────
  // INCOMING MESSAGE HANDLER
  // ────────────────────────────────────────────────

  async handleIncoming(message: WAMessage, sessionId: string): Promise<void> {
    const messageId = message.key?.id;
    if (!message || !message.message || !messageId) {
      Logger.warn(`[MessageHandler] Received invalid message structure`, {
        hasMessage: !!message,
        hasContent: !!message?.message,
        messageId,
      });
      return;
    }

    if (this.recentSentMessageIds.has(messageId)) {
      return;
    }

    try {
      await this.withLock(`msg:${messageId}`, async () => {
        await this.processIncomingMessage(message, sessionId, messageId);
      });
    } catch (error) {
      Logger.error(
        `[MessageHandler] Error processing incoming message ${messageId}:`,
        error,
      );
    }
  }

  // ────────────────────────────────────────────────
  // MESSAGE STATUS UPDATE
  // ────────────────────────────────────────────────

  async handleMessageUpdate(
    whatsappMessageId: string,
    update: WAMessageUpdate,
    sessionId: string,
  ): Promise<void> {
    const currentStatus = update.update?.status;
    if (typeof currentStatus !== "number") return;

    try {
      const statusMap: Record<number, "sent" | "delivered" | "read"> = {
        2: "sent",
        3: "delivered",
        4: "read",
      };

      const newStatus = statusMap[currentStatus];
      if (!newStatus) return;

      const msg = await TenantContextManager.runAsSystem(() =>
        prisma.message.findUnique({
          where: { whatsappMessageId },
          select: {
            id: true,
            conversationId: true,
            status: true,
            companyId: true,
          },
        }),
      );

      if (!msg) return;

      await TenantContextManager.run(
        { companyId: msg.companyId, userId: "system", requestId: "wa-update" },
        async () => {
          await chatService.updateMessageStatus(whatsappMessageId, newStatus);
        },
      );

      this.socketEmitter.emitMessageStatus(
        msg.id,
        msg.conversationId,
        msg.companyId ||
          (this.sessionCache.get(sessionId)?.companyId as string),
        newStatus,
      );
    } catch (error) {
      Logger.error(
        `[MessageHandler] Failed to update message status for ${whatsappMessageId}:`,
        error,
      );
    }
  }

  // ────────────────────────────────────────────────
  // PROCESS INCOMING MESSAGE (Core Orchestration)
  // ────────────────────────────────────────────────

  private async processIncomingMessage(
    message: WAMessage,
    sessionId: string,
    messageId: string,
  ): Promise<void> {
    const sessionData = await this.ensureSessionData(sessionId);
    if (!sessionData) return;

    const { companyId, userId: sessionPhone } = sessionData;

    await TenantContextManager.run(
      {
        companyId,
        userId: sessionPhone || "system",
        requestId: `msg:${messageId}`,
      },
      async () => {
        if (await chatService.doesMessageExist(messageId)) {
          return;
        }

        // 🔍 Identity Resolution (delegated to IdentityResolverService)
        const { cleanRemoteJid } =
          await this.identityResolver.resolveMessageJid(
            message,
            sessionId,
            companyId,
          );

        if (!cleanRemoteJid) return;

        const isGroup = WhatsAppIdUtils.isGroup(cleanRemoteJid);
        let isFromMe = message.key.fromMe || false;

        if (!isFromMe && isGroup && message.key.participant) {
          const senderPhone = WhatsAppIdUtils.getPhoneNumber(
            message.key.participant,
          );
          if (senderPhone && sessionPhone && senderPhone === sessionPhone) {
            isFromMe = true;
          }
        }

        const sock = this.sessionManager.getSession(sessionId);
        const myJidRaw = sock?.user?.id;

        if (myJidRaw) {
          const myJid = WhatsAppIdUtils.getCleanJid(myJidRaw);
          if (cleanRemoteJid === myJid) {
            return;
          }
        }

        const chatUniqueId = cleanRemoteJid.split("@")[0];
        const chatEmail = `${chatUniqueId}@whatsapp.user`;

        let customerUser: User | null = null;
        const pushName = message.pushName;

        if (!isFromMe) {
          const senderJid = this.identityResolver.resolveSenderJid(
            message,
            cleanRemoteJid,
            isGroup,
          );
          const senderPhone = WhatsAppIdUtils.getPhoneNumber(senderJid);

          if (senderJid) {
            customerUser = await chatService.upsertWhatsAppUser({
              email: `${senderJid.split("@")[0]}@whatsapp.user`,
              name:
                pushName ||
                (senderPhone ? `+${senderPhone}` : "Usuario WhatsApp"),
              companyId,
              phone: senderPhone,
              role: "USER",
            });

            this.profilePicService
              .fetchAndPersist(sessionId, senderJid, customerUser.id)
              .catch((err) =>
                Logger.warn(
                  `[MessageHandler] Profile pic fetch failed for ${senderJid}:`,
                  err,
                ),
              );
          }
        } else {
          if (!isGroup) {
            const destPhone = WhatsAppIdUtils.getPhoneNumber(cleanRemoteJid);
            customerUser = await chatService.upsertWhatsAppUser({
              email: chatEmail,
              name: destPhone ? `+${destPhone}` : chatUniqueId,
              companyId,
              phone: destPhone,
              role: "USER",
            });
          }
        }

        const lockKey = `conv:${companyId}:${chatUniqueId}`;

        const conversation = await this.withLock(lockKey, async () => {
          let conv = await chatService.findConversation(
            companyId,
            chatUniqueId,
            chatEmail,
          );

          // 🔍 LID Conversation Resolution (delegated to IdentityResolverService)
          if (!conv && WhatsAppIdUtils.isLid(cleanRemoteJid)) {
            Logger.info(
              `[MessageHandler] 🔍 LID Conversation not found, searching for real phone conversation...`,
            );
            conv = await this.identityResolver.findConversationByLid(
              companyId,
              cleanRemoteJid,
              chatUniqueId,
              sessionId,
              message,
              isFromMe,
            );
          }

          if (!conv) {
            let conversationSubject = message.pushName || chatUniqueId;
            let groupMetadata:
              | {
                  groupName?: string;
                  description?: string;
                  participantCount?: number;
                  groupPicUrl?: string | null;
                }
              | undefined;

            if (isGroup) {
              conversationSubject = `📢 Grupo ${chatUniqueId.slice(0, 8)}...`;
              try {
                const sock = this.sessionManager.getSession(sessionId);
                if (sock) {
                  const groupInfo = await sock.groupMetadata(cleanRemoteJid);
                  if (groupInfo) {
                    conversationSubject = `📢 ${groupInfo.subject || "Grupo"}`;
                    groupMetadata = {
                      groupName: groupInfo.subject,
                      description: groupInfo.desc || undefined,
                      participantCount: groupInfo.participants?.length,
                      groupPicUrl: undefined,
                    };
                  }
                }
              } catch {
                Logger.warn(
                  `[MessageHandler] Could not fetch group metadata for ${cleanRemoteJid}`,
                );
              }
            }

            conv = await chatService.createConversation({
              companyId,
              channelId: chatUniqueId,
              subject: conversationSubject,
              userId: customerUser?.id || undefined,
              isGroup,
              groupMetadata,
            });
          }

          if (["CLOSED", "RESOLVED"].includes(conv.status)) {
            await chatService.updateConversation(conv.id, { status: "OPEN" });
          }
          return await chatService.getFullConversation(conv.id);
        });

        if (!conversation) return;

        const contentData = await this.extractMessageContent(
          message,
          messageId,
        );

        if (!contentData) {
          return;
        }

        const { textContent, mediaUrl, mediaType, mediaSize } = contentData;
        const isOutbound = isFromMe;
        let dbSenderId = customerUser?.id;

        if (isOutbound) {
          // 🛡️ Database-level Deduplication
          const recentThreshold = new Date(Date.now() - 10000);
          const existingDuplicate = await prisma.message.findFirst({
            where: {
              conversationId: conversation.id,
              direction: "OUTBOUND",
              content: textContent,
              createdAt: { gt: recentThreshold },
            },
          });

          if (existingDuplicate) {
            Logger.info(
              `[MessageHandler] 🛡️ Ignoring duplicate outbound message (DB Detect): ${messageId} | matches ${existingDuplicate.id}`,
            );
            return;
          }

          // Memory Dedup
          if (textContent) {
            const dedupKey = this.getDedupKey(conversation.id, textContent);
            if (this.recentSentContent.has(dedupKey)) {
              Logger.info(
                `[MessageHandler] 🛡️ Ignoring duplicate outbound message (Memory Content Detect): ${messageId}`,
              );
              return;
            }
          }

          if (conversation.assignedToId) {
            dbSenderId = conversation.assignedToId;
          } else {
            const sessionOwner = await prisma.user.findFirst({
              where: { phone: sessionPhone, companyId },
            });
            dbSenderId = sessionOwner?.id;

            if (!dbSenderId) {
              const defaultAgent = await prisma.user.findFirst({
                where: { companyId, role: "ADMIN" },
              });
              dbSenderId = defaultAgent?.id;
            }
          }
        }

        const metadata: MessageMetadata = {
          messageId,
          media:
            mediaUrl && mediaType
              ? {
                  type:
                    mediaType === MediaType.IMAGE
                      ? "image"
                      : mediaType === MediaType.VIDEO
                        ? "video"
                        : mediaType === MediaType.AUDIO
                          ? "audio"
                          : "document",
                  size: mediaSize,
                  url: mediaUrl,
                }
              : undefined,
          origin: isOutbound ? "phone_sync" : "whatsapp",
          isGroup,
        };

        const savedMessage = await chatService.upsertMessage({
          whatsappMessageId: messageId,
          companyId,
          content: textContent,
          direction: isOutbound ? "OUTBOUND" : "INBOUND",
          conversationId: conversation.id,
          senderId: dbSenderId || conversation.participants[0]?.id,
          status: isOutbound ? "SENT" : "DELIVERED",
          metadata: prepareMetadataForDB(metadata),
          createdAt:
            typeof message.messageTimestamp === "number"
              ? new Date(message.messageTimestamp * 1000)
              : new Date(),
        });

        const fullConversation = await chatService.getFullConversation(
          conversation.id,
        );

        if (fullConversation) {
          if (isOutbound) {
            this.socketEmitter.emitMessageSent(savedMessage, fullConversation);
          } else {
            let ticketId = undefined;
            try {
              if (customerUser) {
                const ticket = await chatService.ensureTicket(
                  companyId,
                  conversation.id,
                  customerUser.id,
                  conversation.subject || "WhatsApp",
                  textContent || "Media",
                );
                ticketId = ticket?.id;
              }
            } catch (e) {
              Logger.error("Ticket error", e);
            }

            this.socketEmitter.emitMessageReceived(
              savedMessage,
              fullConversation,
              ticketId,
            );

            // 🤖 AI + Flow Bot (delegated to AITriggerService)
            if (textContent && !isGroup) {
              await this.aiTrigger.processInboundTriggers(
                conversation as ConversationWithQueue,
                textContent,
                companyId,
                cleanRemoteJid,
                customerUser,
                pushName,
              );
            }
          }
        }
      },
    );
  }

  // ────────────────────────────────────────────────
  // SESSION DATA CACHE
  // ────────────────────────────────────────────────

  private async ensureSessionData(
    sessionId: string,
  ): Promise<SessionData | null> {
    let sessionData = this.sessionCache.get(sessionId);
    if (!sessionData) {
      const session = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
        select: { companyId: true, phone: true },
      });
      if (!session) return null;
      sessionData = {
        companyId: session.companyId,
        sessionId,
        status: "CONNECTED",
        userId: session.phone || undefined,
      };
      this.sessionCache.set(sessionId, sessionData);
    }
    return sessionData;
  }

  // ────────────────────────────────────────────────
  // MEDIA CONTENT EXTRACTION
  // ────────────────────────────────────────────────

  private async extractMessageContent(
    message: WAMessage,
    messageId: string,
  ): Promise<{
    textContent: string;
    mediaUrl?: string;
    mediaType?: MediaType | null;
    mediaSize?: number;
  } | null> {
    return mediaProcessor.extractMessageContent(message, messageId);
  }

  // ────────────────────────────────────────────────
  // SEND MESSAGE
  // ────────────────────────────────────────────────

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
      this.recentSentMessageIds.add(generatedId);
      setTimeout(() => this.recentSentMessageIds.delete(generatedId), 10000);

      const dedupKey = this.getDedupKey(conversationId, content);
      this.recentSentContent.add(dedupKey);
      setTimeout(() => this.recentSentContent.delete(dedupKey), 10000);

      const sentMsg = await sock.sendMessage(
        jid,
        { text: content },
        { messageId: generatedId },
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
      this.recentSentMessageIds.add(generatedId);
      setTimeout(() => this.recentSentMessageIds.delete(generatedId), 10000);

      const sentMsg = await sock.sendMessage(jid, messageContent, {
        messageId: generatedId,
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

    const session = await prisma.whatsAppSession.findUnique({
      where: { sessionId },
      select: { companyId: true },
    });
    if (!session) return;

    await TenantContextManager.run(
      { companyId: session.companyId, requestId: `read:${messageId}` },
      async () => {
        const msg = await prisma.message.findUnique({
          where: { id: messageId },
          include: { conversation: true },
        });

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

  private getDedupKey(conversationId: string, content: string): string {
    return `${conversationId}:${content.trim()}`;
  }
}
