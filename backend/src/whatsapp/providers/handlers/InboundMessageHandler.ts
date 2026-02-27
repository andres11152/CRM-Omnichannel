import { ISessionManager } from "../../core/interfaces/ISessionManager";
import { WAMessage } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { WAMessageSchema } from "../../core/validation/baileys.schemas";
import { deduplicationService } from "../../services/DeduplicationService";
import { TenantContextManager } from "@/config/tenantContext";
import { chatService } from "@/services/chatService";
import { IdentityResolverService } from "../../services/IdentityResolverService";
import { AITriggerService } from "../../services/AITriggerService";
import { ProfilePictureService } from "../../services/ProfilePictureService";
import { WhatsAppIdUtils } from "../../utils/WhatsAppIdUtils";
import { contactRepository } from "@/repositories/ContactRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { mediaProcessor } from "../../services/MediaProcessorService";
import { Conversation, Queue, User, MediaType, Prisma } from "@prisma/client";
import { MessageMetadata, SessionData } from "@/types/whatsapp.types";
import { SocketEventEmitter } from "@/services/socketEventEmitter";
import { gateway } from "@/gateways/socketGateway";

type ConversationWithQueue = Conversation & {
  queue: (Queue & { aiAssistantId: string | null }) | null;
  participants: User[];
  assignedTo: User | null;
};

const prepareMetadataForDB = (meta: MessageMetadata): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(meta));
};

/**
 * 📨 INBOUND MESSAGE HANDLER
 *
 * Responsibilities:
 * - Validate & deduplicate incoming WhatsApp messages
 * - Resolve identity (LID/Phone)
 * - Persist message + conversation + ticket
 * - Trigger AI/Flow bots
 * - Emit Socket.IO events
 */
export class InboundMessageHandler {
  private socketEmitter: SocketEventEmitter;
  private sessionCache = new Map<string, SessionData>();
  private conversionQueues = new Map<string, Promise<void>>();

  constructor(
    private sessionManager: ISessionManager,
    private identityResolver: IdentityResolverService,
    private aiTrigger: AITriggerService,
    private profilePicService: ProfilePictureService,
  ) {
    this.socketEmitter = new SocketEventEmitter(gateway);
  }

  // ────────────────────────────────────────────────
  // MUTEX LOCK (per-message/per-conversation)
  // ────────────────────────────────────────────────

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

  // ────────────────────────────────────────────────
  // ENTRY POINT: handleIncoming
  // ────────────────────────────────────────────────

  async handleIncoming(
    payload: { message: WAMessage } | WAMessage,
    sessionId: string,
  ): Promise<void> {
    const rawMessage =
      "message" in payload &&
      "key" in (payload as { message: WAMessage }).message
        ? (payload as { message: WAMessage }).message
        : (payload as WAMessage);

    Logger.info(
      `[InboundHandler] Entered handleIncoming for message: ${rawMessage?.key?.id}`,
    );

    // 🛡️ Zod Validation
    const validated = WAMessageSchema.safeParse(rawMessage);
    if (!validated.success) {
      Logger.warn(`[InboundHandler] ⚠️ Invalid WAMessage structure dropped`, {
        sessionId,
        errors: validated.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      return;
    }

    const messageId = rawMessage.key?.id;
    if (!rawMessage || !rawMessage.message || !messageId) {
      Logger.warn(`[InboundHandler] Received invalid message structure`, {
        hasMessage: !!rawMessage,
        hasContent: !!rawMessage?.message,
        messageId,
      });
      return;
    }

    if (await deduplicationService.isOwnEcho(messageId)) {
      return;
    }

    try {
      await this.withLock(`msg:${messageId}`, async () => {
        await this.processIncomingMessage(rawMessage, sessionId, messageId);
      });
    } catch (error) {
      Logger.error(
        `[InboundHandler] Error processing incoming message ${messageId}:`,
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

        // 🚫 SPAM GATE: Silently drop messages from blocked contacts
        if (!isFromMe && !isGroup) {
          const senderPhone = WhatsAppIdUtils.getPhoneNumber(cleanRemoteJid);
          if (senderPhone) {
            const blockedContact = await contactRepository
              .findMany({
                where: {
                  companyId,
                  phone: senderPhone,
                  isBlocked: true,
                },
                select: { id: true },
                take: 1,
              })
              .then((results) => results[0] || null);

            if (blockedContact) {
              Logger.info(
                `[InboundHandler] 🚫 SPAM GATE: Blocked message from ${senderPhone} (Contact: ${blockedContact.id})`,
              );
              return;
            }
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
              .fetchAndPersist(sessionId, senderJid, customerUser.id, companyId)
              .catch((err) =>
                Logger.warn(
                  `[InboundHandler] Profile pic fetch failed for ${senderJid}:`,
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

          // 🔍 LID Conversation Resolution
          if (!conv && WhatsAppIdUtils.isLid(cleanRemoteJid)) {
            Logger.info(
              `[InboundHandler] 🔍 LID Conversation not found, searching for real phone conversation...`,
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
                  `[InboundHandler] Could not fetch group metadata for ${cleanRemoteJid}`,
                );
              }
            }

            // 🛡️ 100-YEAR FIX: Link conversation to CRM Contact from creation
            let contactId: string | undefined;
            if (!isGroup) {
              const phone = WhatsAppIdUtils.getPhoneNumber(cleanRemoteJid);
              if (phone) {
                const contact = await chatService.findContact(companyId, phone);
                contactId = contact?.id;
              }
            }

            conv = await chatService.createConversation({
              companyId,
              channelId: chatUniqueId,
              subject: conversationSubject,
              userId: customerUser?.id || undefined,
              contactId,
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
          const existingDuplicate =
            await messageRepository.findDuplicateOutbound(
              conversation.id,
              textContent,
              recentThreshold,
            );

          if (existingDuplicate) {
            Logger.info(
              `[InboundHandler] 🛡️ Ignoring duplicate outbound message (DB Detect): ${messageId} | matches ${existingDuplicate.id}`,
            );
            return;
          }

          // Redis-Backed Dedup
          if (textContent) {
            if (
              await deduplicationService.isContentDuplicate(
                conversation.id,
                textContent,
              )
            ) {
              Logger.info(
                `[InboundHandler] 🛡️ Ignoring duplicate outbound message (Content Detect): ${messageId}`,
              );
              return;
            }
          }

          if (conversation.assignedToId) {
            dbSenderId = conversation.assignedToId;
          } else {
            const sessionOwner = await messageRepository.getSessionOwner(
              sessionPhone,
              companyId,
            );
            dbSenderId = sessionOwner?.id;

            if (!dbSenderId) {
              const defaultAgent =
                await messageRepository.getDefaultAgent(companyId);
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
                  sessionData.defaultQueueId,
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

  async ensureSessionData(sessionId: string): Promise<SessionData | null> {
    let sessionData = this.sessionCache.get(sessionId);
    if (!sessionData) {
      const session = await whatsappSessionRepository.findOne(sessionId);
      if (!session) return null;
      sessionData = {
        companyId: session.companyId,
        sessionId,
        status: "CONNECTED",
        userId: session.phone || undefined,
        defaultQueueId: session.defaultQueueId,
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
}
