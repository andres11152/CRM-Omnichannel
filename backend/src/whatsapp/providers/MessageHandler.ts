import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import {
  MessagePayload,
  SendMessageOptions,
  MediaPayload,
} from "../core/types/whatsapp.types";
import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType } from "../core/events/WhatsAppEvents";
import { prisma } from "@/config/database";
import {
  downloadMediaMessage,
  WAMessage,
  WAMessageContent,
  AnyMessageContent,
  WAMessageUpdate,
} from "@whiskeysockets/baileys";
import { gateway } from "@/gateways/socketGateway";
import { TenantContextManager } from "@/config/tenantContext";
import { SocketEventEmitter } from "@/services/socketEventEmitter";
import { generateAIResponse } from "@/services/aiResponseService";
import { storageService } from "@/services/storageService";
import mime from "mime-types";
import { Readable } from "stream";
// 🛠️ UTILS
import { convertAudioToMP4, cleanupTempFile } from "@/utils/audioConverter";
import fs from "fs";

// 🏗️ SERVICES & INTERFACES (Clean Architecture)
import { chatService } from "@/services/chatService";
import {
  ExtendedMessageKey,
  SessionData,
  MessageMetadata,
} from "@/interfaces/WhatsAppEvents";
import { Conversation, Queue, MediaType, Prisma, User } from "@prisma/client";
import { AIResponseSchema } from "@/interfaces/AIInterfaces";

type ConversationWithQueue = Conversation & {
  queue: (Queue & { aiAssistantId: string | null }) | null;
  participants: User[];
  assignedTo: User | null;
};

// 🛠️ HELPER: Map Baileys Types to Prisma Enums
const mapBaileysToMediaType = (baileysType: string): MediaType => {
  const type = baileysType.toLowerCase();
  if (type.includes("image")) return MediaType.IMAGE;
  if (type.includes("video")) return MediaType.VIDEO;
  if (type.includes("audio")) return MediaType.AUDIO;
  return MediaType.DOCUMENT;
};

/**
 * 🧼 DATA SANITIZATION: prepares metadata for Prisma JSON storage.
 * Removes 'undefined' values which Prisma rejects, ensuring strict 100-year compatibility.
 */
const prepareMetadataForDB = (meta: MessageMetadata): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(meta));
};

export class MessageHandler implements IMessageHandler {
  private eventBus: EventBus;
  private sessionCache = new Map<string, SessionData>();
  private conversionQueues = new Map<string, Promise<void>>();
  private recentSentMessageIds = new Set<string>();
  private socketEmitter: SocketEventEmitter;

  constructor(private sessionManager: ISessionManager) {
    this.eventBus = EventBus.getInstance();
    this.socketEmitter = new SocketEventEmitter(gateway);
    this.subscribeToEvents();
  }

  /**
   * 🔒 MUTEX: Executes a task sequentially for a given key.
   * Robust implementation prevents race conditions and handles errors gracefully.
   */
  private async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.conversionQueues.get(key) || Promise.resolve();

    // Chain promises safely
    const resultPromise = previous
      .then(() => task())
      .catch((err) => {
        // Log critical failure in concurrency chain
        console.error(`[Mutex] Critical task failure for ${key}:`, err);
        // Propagate error to caller
        throw err;
      });

    // Create a signal promise that always resolves (for the next task in queue)
    const signalPromise = resultPromise
      .then(() => {
        /* Success signal */
      })
      .catch(() => {
        /* Swallow error for signal, it's already handled in resultPromise */
      });

    this.conversionQueues.set(key, signalPromise);

    // Self-cleanup of the queue map
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
  }

  async handleIncoming(message: WAMessage, sessionId: string): Promise<void> {
    const messageId = message.key?.id;
    // 🛡️ 100-YEAR FIX: Strict null checks for Baileys objects
    if (!message || !message.message || !messageId) {
      console.warn(`[MessageHandler] Received invalid message structure`, {
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
      console.error(
        `[MessageHandler] Error processing incoming message ${messageId}:`,
        error,
      );
    }
  }

  /**
   * 📬 UPDATE MESSAGE STATUS: Handles delivery and read receipts
   */
  async handleMessageUpdate(
    whatsappMessageId: string,
    update: WAMessageUpdate,
    sessionId: string,
  ): Promise<void> {
    // 🛡️ 100-YEAR FIX: Access nested 'update' property from WAMessageUpdate
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

      // 1. Fetch message to get Conversation ID and check existence
      // 🛡️ SYSTEM MODE: Background update from WhatsApp Event
      const msg = await TenantContextManager.runAsSystem(() =>
        prisma.message.findUnique({
          where: { whatsappMessageId },
          select: {
            id: true,
            conversationId: true,
            status: true,
            companyId: true, // Needed for context
          },
        }),
      );

      if (!msg) return;

      // 2. Update Status in DB (persistently)
      // 🛡️ TENANT MODE: Switch to specific tenant context for safety
      await TenantContextManager.run(
        { companyId: msg.companyId, userId: "system", requestId: "wa-update" },
        async () => {
          await chatService.updateMessageStatus(whatsappMessageId, newStatus);
        },
      );

      // 3. Emit socket event for real-time UI update
      this.socketEmitter.emitMessageStatus(
        msg.id,
        msg.conversationId,
        msg.companyId ||
          (this.sessionCache.get(sessionId)?.companyId as string),
        newStatus,
      );
    } catch (error) {
      console.error(
        `[MessageHandler] Failed to update message status for ${whatsappMessageId}:`,
        error,
      );
    }
  }

  private async processIncomingMessage(
    message: WAMessage,
    sessionId: string,
    messageId: string,
  ): Promise<void> {
    let sessionData = this.sessionCache.get(sessionId);

    if (!sessionData) {
      const session = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
        select: { companyId: true, phone: true },
      });

      if (!session) return;

      sessionData = {
        companyId: session.companyId,
        sessionId,
        status: "CONNECTED",
        userId: session.phone || undefined,
      };
      this.sessionCache.set(sessionId, sessionData);
    }

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

        const rawRemoteJid = message.key.remoteJid!;
        const baseJid = rawRemoteJid.split(":")[0].split("@")[0];
        const domain = rawRemoteJid.split("@")[1];
        const isLid = domain === "lid";
        const isLikelyLid = isLid || baseJid.length > 13;
        let truePhone =
          !isLikelyLid && /^\d{7,15}$/.test(baseJid) ? baseJid : null;
        let uniqueSystemId = baseJid;

        if (isLid && !truePhone) {
          const foundRealPhone = this.extractPhoneFromLid(message);
          if (foundRealPhone) {
            const cleanRealPhone = foundRealPhone.split("@")[0].split(":")[0];
            truePhone = cleanRealPhone;
            uniqueSystemId = cleanRealPhone;
          }
        }

        // 100-Year Solution: Strict Self-Chat Filtering & Normalization
        // Normalize phones to pure digits for robust comparison (ignores +, spaces, etc)
        const cleanSessionPhone = sessionPhone?.replace(/\D/g, "");
        const cleanBaseJid = baseJid.replace(/\D/g, "");
        const cleanTruePhone = truePhone?.replace(/\D/g, "");

        // 1. Check if the message target/source matches the connected system number
        if (
          cleanSessionPhone &&
          (cleanBaseJid === cleanSessionPhone ||
            cleanTruePhone === cleanSessionPhone)
        ) {
          // Verify it's not a misidentified customer (double check logical flow)
          // If remoteJid == MyNumber, it's a self-chat (Note to Self). Ignore.
          return;
        }

        // 2. Extra Safety: If fromMe is true, and the remote ID looks suspiciously like it could be us (but sessionPhone was missing),
        // we might handle it, but for now rely on sessionPhone presence.
        // If sessionPhone is missing from cache, this check might fail, so ensure SessionManager updates DB correctly.

        const messageType = Object.keys(message.message)[0];
        const pushName = message.pushName;

        if (truePhone) {
          const existing = await chatService.findUserByPhone(
            companyId,
            truePhone,
            `${uniqueSystemId}@whatsapp.user`,
          );
          if (existing) uniqueSystemId = existing.email.split("@")[0];
        } else if (isLid && pushName) {
          const existing = await chatService.findUserByName(
            companyId,
            pushName,
          );
          if (existing) uniqueSystemId = existing.email.split("@")[0];
        }

        let textContent = "";
        let mediaUrl: string | undefined;
        let mediaSize = 0;
        let mediaType: MediaType | null = null;

        if (messageType === "conversation") {
          textContent = message.message.conversation || "";
        } else if (messageType === "extendedTextMessage") {
          textContent = message.message.extendedTextMessage?.text || "";
        } else {
          const supportedMedia = [
            "imageMessage",
            "videoMessage",
            "audioMessage",
            "documentMessage",
            "stickerMessage",
          ];
          if (supportedMedia.includes(messageType)) {
            try {
              const stream = await downloadMediaMessage(message, "stream", {});

              const content = message.message as WAMessageContent;
              // Strict Type Guarding via Cast - Extended for Mime/Size
              const rawContent = content as unknown as Record<
                string,
                {
                  caption?: string;
                  text?: string;
                  fileName?: string;
                  mimetype?: string;
                  fileLength?: number | string;
                }
              >;
              const msgObj = rawContent[messageType];

              textContent =
                msgObj?.caption ||
                msgObj?.text ||
                msgObj?.fileName ||
                `[${mapBaileysToMediaType(messageType)}]`;

              if (stream) {
                mediaType = mapBaileysToMediaType(messageType);
                const mimetype = msgObj?.mimetype || "application/octet-stream";
                const ext = mime.extension(mimetype) || "bin";
                const filename = `${messageId}.${ext}`;

                // Upload Stream (No Heap Load)
                const uploadResult = await storageService.uploadStream(
                  stream as Readable,
                  filename,
                  mimetype,
                );
                mediaUrl = uploadResult.url;
                mediaSize = Number(msgObj?.fileLength || 0);
              }
            } catch (e) {
              console.error(
                `[media] Download/Upload failed for ${messageId}`,
                e,
              );
            }
          }
        }

        const customerEmail = `${uniqueSystemId}@whatsapp.user`;
        const customer = await chatService.upsertWhatsAppUser({
          email: customerEmail,
          name: pushName || (truePhone ? `+${truePhone}` : "Usuario WhatsApp"),
          companyId,
          phone: truePhone,
          role: "USER", // Default role
        });

        if (
          message.key.fromMe &&
          ["ADMIN", "MASTER", "AGENT"].includes(customer.role)
        )
          return;

        const lockKey = `conv:${companyId}:${uniqueSystemId}`;

        const conversation = await this.withLock(lockKey, async () => {
          let conv = await chatService.findConversation(
            companyId,
            uniqueSystemId,
            customerEmail,
          );

          if (!conv) {
            if (truePhone) {
              const ghost = await chatService.findGhostConversation(companyId);
              if (ghost && ghost.participants.length === 1) {
                await chatService.migrateConversationHistory(
                  ghost.id,
                  ghost.participants[0].id,
                  customer.id,
                );
                conv = await chatService.findConversation(
                  companyId,
                  uniqueSystemId,
                  customerEmail,
                );
              }
            }

            if (!conv) {
              conv = await chatService.createConversation({
                companyId,
                channelId: uniqueSystemId,
                subject: customer.name || uniqueSystemId,
                userId: customer.id,
              });
            }
          } else {
            if (["CLOSED", "RESOLVED"].includes(conv.status)) {
              await chatService.updateConversation(conv.id, { status: "OPEN" });
            } else {
              await chatService.updateConversation(conv.id, {});
            }
          }

          const convWithQueue = await prisma.conversation.findUnique({
            where: { id: conv!.id },
            include: { queue: true, participants: true, assignedTo: true },
          });

          return convWithQueue as ConversationWithQueue;
        });

        let ticketId: string | undefined;
        try {
          const ticket = await chatService.ensureTicket(
            companyId,
            conversation.id,
            customer.id,
            conversation.subject || "WhatsApp",
            textContent || "Media",
          );
          ticketId = ticket?.id;
        } catch (err) {
          console.error("[Ticket] Creation failed (ignoring):", err);
        }

        const isOutbound = message.key.fromMe || false;
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
          ticketId,
          origin: isOutbound ? "phone_sync" : "whatsapp",
        };

        const savedMessage = await chatService.upsertMessage({
          whatsappMessageId: messageId,
          companyId,
          content: textContent,
          direction: isOutbound ? "OUTBOUND" : "INBOUND",
          conversationId: conversation.id,
          senderId: customer.id,
          status: isOutbound ? "SENT" : "DELIVERED",
          metadata: prepareMetadataForDB(metadata), // 🛡️ Approved sanitization
          createdAt:
            typeof message.messageTimestamp === "number"
              ? new Date(message.messageTimestamp * 1000)
              : typeof message.messageTimestamp === "object"
                ? new Date(Number(message.messageTimestamp) * 1000)
                : undefined,
        });

        const fullConversation = await chatService.getFullConversation(
          conversation.id,
        );

        if (fullConversation) {
          // Enriched payload strictly typed
          const enrichedPayload = ticketId
            ? { ...fullConversation, ticketId }
            : fullConversation;

          // Use inference from the emitter method signature to ensure type compatibility
          // We cast through unknown to allow excessive properties (ticketId) to pass through to the socket payload
          type EmitterPayload = Parameters<
            typeof this.socketEmitter.emitConversationCreated
          >[0];
          this.socketEmitter.emitConversationCreated(
            enrichedPayload as unknown as EmitterPayload,
          );

          if (isOutbound) {
            this.socketEmitter.emitMessageSent(savedMessage, fullConversation);
          } else {
            this.socketEmitter.emitMessageReceived(
              savedMessage,
              fullConversation,
              ticketId,
            );
            if (textContent) {
              this.triggerAIResponse(
                conversation,
                textContent,
                companyId,
              ).catch(() => {});
            }
          }
        }
      },
    );
  }

  private extractPhoneFromLid(message: WAMessage): string | null {
    const key = message.key as ExtendedMessageKey;
    if (key.senderPn?.includes("@s.whatsapp.net")) return key.senderPn;
    if (key.remoteJidAlt?.includes("@s.whatsapp.net")) return key.remoteJidAlt;
    if (
      key.participant?.includes("@s.whatsapp.net") &&
      !key.participant.includes("@lid")
    )
      return key.participant;
    if (
      message.participant?.includes("@s.whatsapp.net") &&
      !message.participant.includes("@lid")
    )
      return message.participant;

    if (message.messageStubParameters) {
      const found = message.messageStubParameters.find(
        (p) => p && p.includes("@s.whatsapp.net") && !p.includes("@lid"),
      );
      if (found) return found;
    }
    return null;
  }

  private async triggerAIResponse(
    conversation: ConversationWithQueue,
    messageContent: string,
    companyId: string,
  ) {
    if (!conversation?.queue?.aiAssistantId) return;
    await new Promise((r) => setTimeout(r, 1500));

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const formattedHistory = history.reverse().map((m) => ({
      role: (m.direction === "INBOUND" ? "user" : "model") as "user" | "model",
      parts: m.content,
    }));

    const rawResponse = await generateAIResponse(
      companyId,
      conversation.queue.aiAssistantId,
      messageContent,
      formattedHistory,
    );

    if (rawResponse) {
      const validation = AIResponseSchema.safeParse(rawResponse);
      if (!validation.success) return;

      const cleanResponse = validation.data;
      const botEmail = `ai_${conversation.queue.aiAssistantId}@reply.bot`;
      const botUser = await chatService.upsertWhatsAppUser({
        email: botEmail,
        name: "AI Assistant",
        companyId,
        role: "AGENT",
      });

      await TenantContextManager.run(
        { companyId, userId: botUser.id, requestId: "ai" },
        async () => {
          await this.sendMessage(conversation.channelId, cleanResponse, {
            companyId,
            conversationId: conversation.id,
            senderId: botUser.id,
            metadata: {
              aiGenerated: true,
              aiAssistantId: conversation.queue!.aiAssistantId,
            },
          });
        },
      );
    }
  }

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { companyId, conversationId, senderId, metadata } = options;
    const session = await prisma.whatsAppSession.findFirst({
      where: { companyId, status: "CONNECTED" },
    });
    if (!session) throw new Error("No session");

    const sock = this.sessionManager.getSession(session.sessionId);
    if (!sock) throw new Error("No socket");

    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    const sentMsg = await sock.sendMessage(jid, { text: content });

    if (sentMsg?.key?.id) {
      this.recentSentMessageIds.add(sentMsg.key.id);
      setTimeout(
        () => this.recentSentMessageIds.delete(sentMsg!.key.id!),
        10000,
      );
    }

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
      metadata: prepareMetadataForDB(mergedMeta), // 🛡️ Sanitized
    });

    await chatService.updateConversation(conversationId, {});
    const fullConv = await chatService.getFullConversation(conversationId);
    if (fullConv) this.socketEmitter.emitMessageSent(savedMessage, fullConv);

    // 🚀 100-YEAR FIX: Return savedMessage (with DB id) for frontend deduplication
    // Frontend needs savedMessage.id to prevent race condition duplicates
    return savedMessage as unknown as MessagePayload;
  }

  async sendMedia(
    to: string,
    media: MediaPayload,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { companyId, conversationId, senderId } = options;
    const session = await prisma.whatsAppSession.findFirst({
      where: { companyId, status: "CONNECTED" },
    });
    if (!session) throw new Error("No session");

    const sock = this.sessionManager.getSession(session.sessionId);
    if (!sock) throw new Error("No socket");

    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

    // ✅ 100-YEAR FIX: Use Strict Types from Baileys
    let messageContent: AnyMessageContent;
    let metaType: "image" | "video" | "audio" | "document";
    let tempFilePath: string | null = null;

    try {
      if (media.type === "image") {
        messageContent = { image: { url: media.url }, caption: media.caption };
        metaType = "image";
      } else if (media.type === "video") {
        messageContent = { video: { url: media.url }, caption: media.caption };
        metaType = "video";
      } else if (media.type === "document") {
        messageContent = {
          document: { url: media.url },
          mimetype: media.mimetype || "application/octet-stream",
          fileName: media.filename || "file",
          caption: media.caption,
        };
        metaType = "document";
      } else if (media.type === "audio") {
        // let finalAudioUrl = media.url; // Unused
        const isBase64 = media.url.startsWith("data:");

        // 🔄 AUTO-CONVERT BASE64 AUDIO (WebM -> OGG/Opus)
        if (isBase64) {
          try {
            // console.log("[MessageHandler] 🔄 Converting Base64 audio to OGG/Opus...");
            tempFilePath = await convertAudioToMP4(media.url);
            // console.log("[MessageHandler] ✅ Conversion successful:", tempFilePath);

            // Read file buffer and send as buffer (Baileys handles it better)
            const audioBuffer = fs.readFileSync(tempFilePath);

            messageContent = {
              audio: audioBuffer,
              mimetype: "audio/ogg; codecs=opus",
              ptt: true,
            };
          } catch (error) {
            console.error(
              "[MessageHandler] ❌ Conversion failed, falling back to raw:",
              error,
            );
            // Fallback to original
            messageContent = {
              audio: { url: media.url },
              mimetype: "audio/ogg; codecs=opus",
              ptt: true,
            };
          }
        } else {
          // Normal URL flow
          messageContent = {
            audio: { url: media.url },
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
          };
        }

        metaType = "audio";
      } else if (media.type === "sticker") {
        messageContent = { sticker: { url: media.url } };
        metaType = "image";
      } else {
        throw new Error("Unsupported media type");
      }

      const sentMsg = await sock.sendMessage(jid, messageContent);
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
        metadata: prepareMetadataForDB(meta), // 🛡️ Sanitized
      });

      await chatService.updateConversation(conversationId, {});
      const fullConv = await chatService.getFullConversation(conversationId);
      if (fullConv) this.socketEmitter.emitMessageSent(savedMessage, fullConv);

      // 🚀 100-YEAR FIX: Return savedMessage (with DB id) for frontend deduplication
      return savedMessage as unknown as MessagePayload;
    } finally {
      // 🧹 CLEANUP TEMP FILE ALWAYS
      if (tempFilePath) {
        cleanupTempFile(tempFilePath).catch((err) =>
          console.warn(
            `[MessageHandler] Cleanup failed for ${tempFilePath}:`,
            err,
          ),
        );
      }
    }
  }

  async markAsRead(messageId: string, sessionId: string): Promise<void> {
    const sock = this.sessionManager.getSession(sessionId);
    if (!sock) return;

    // Get CompanyId for context
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

  // ✅ ADDED: Presence Update Implementation
  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    const session = await prisma.whatsAppSession.findFirst({
      where: { companyId, status: "CONNECTED" },
    });
    if (!session) return;

    const sock = this.sessionManager.getSession(session.sessionId);
    if (!sock) return;

    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    // Baileys types allow 'composing' | 'recording' | 'paused'
    await sock.sendPresenceUpdate(type, jid);
  }
}
