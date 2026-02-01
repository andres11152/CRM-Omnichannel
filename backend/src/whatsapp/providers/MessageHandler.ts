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
import { WhatsAppIdUtils } from "../utils/WhatsAppIdUtils";

// 🏗️ SERVICES & INTERFACES (Clean Architecture)
import { chatService } from "@/services/chatService";
import { SessionData, MessageMetadata } from "@/interfaces/WhatsAppEvents";
import { Conversation, Queue, MediaType, Prisma, User } from "@prisma/client";
import { AIResponseSchema } from "@/interfaces/AIInterfaces";
import { flowExecutor } from "@/services/flowExecutor";

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
        // 0. Deduplication Check
        if (await chatService.doesMessageExist(messageId)) {
          return;
        }

        // 1. JID Parsing
        const rawRemoteJid = message.key.remoteJid;
        let cleanRemoteJid = WhatsAppIdUtils.getCleanJid(rawRemoteJid);

        if (!cleanRemoteJid) {
          console.warn(`[MessageHandler] Invalid JID: ${rawRemoteJid}`);
          return;
        }

        // 🛡️ 100-YEAR FIX: LIDs to Phone Resolution (Conversation Level)
        // If the conversation ID is a LID, resolve it to the Real Phone ID immediately.
        if (WhatsAppIdUtils.isLid(cleanRemoteJid)) {
          console.info(`[MessageHandler] 🔍 LID Detected: ${cleanRemoteJid}`);

          let resolved = false;

          // 🎯 STEP 0: Check hidden properties where Baileys stores real JIDs
          // 1. remoteJidAlt (Standard Baileys)
          // 2. senderPn (Observed in logs for some versions)
          const messageKey = message.key as {
            remoteJidAlt?: string;
            senderPn?: string;
          };

          // 🔬 DEBUG: Log keys to confirm hidden properties
          console.info(
            `[MessageHandler] 🔬 Message Key Dump:`,
            JSON.stringify(message.key),
          );

          // Check remoteJidAlt
          if (
            messageKey.remoteJidAlt &&
            messageKey.remoteJidAlt.includes("@s.whatsapp.net") &&
            !messageKey.remoteJidAlt.includes("@lid")
          ) {
            console.info(
              `[MessageHandler] 🎯 FOUND! Real phone in remoteJidAlt: ${messageKey.remoteJidAlt}`,
            );
            cleanRemoteJid =
              WhatsAppIdUtils.getCleanJid(messageKey.remoteJidAlt) ||
              cleanRemoteJid;
            resolved = true;
          }

          // Check senderPn (Found in user logs via debug)
          if (
            !resolved &&
            messageKey.senderPn &&
            messageKey.senderPn.includes("@s.whatsapp.net") &&
            !messageKey.senderPn.includes("@lid")
          ) {
            console.info(
              `[MessageHandler] 🎯 FOUND! Real phone in senderPn: ${messageKey.senderPn}`,
            );
            cleanRemoteJid =
              WhatsAppIdUtils.getCleanJid(messageKey.senderPn) ||
              cleanRemoteJid;
            resolved = true;
          }

          // STEP 1: Check participant field (for group messages)
          const participant = message.key.participant;
          if (!resolved && participant && !WhatsAppIdUtils.isLid(participant)) {
            console.info(
              `[MessageHandler] 🎯 Resolved via participant: ${participant}`,
            );
            cleanRemoteJid =
              WhatsAppIdUtils.getCleanJid(participant) || cleanRemoteJid;
            resolved = true;
          }

          // STEP 1.5: Check messageStubParameters (Legacy fallback)
          if (
            !resolved &&
            message.messageStubParameters &&
            Array.isArray(message.messageStubParameters)
          ) {
            for (const param of message.messageStubParameters) {
              if (
                typeof param === "string" &&
                param.includes("@s.whatsapp.net") &&
                !param.includes("@lid")
              ) {
                console.info(
                  `[MessageHandler] 🎯 Resolved via messageStubParameters: ${param}`,
                );
                cleanRemoteJid =
                  WhatsAppIdUtils.getCleanJid(param) || cleanRemoteJid;
                resolved = true;
                break;
              }
            }
          }

          // STEP 2: Try store resolution (cached mappings)
          if (!resolved) {
            const resolvedContact =
              this.sessionManager.findContactByLid(cleanRemoteJid);
            if (
              resolvedContact?.id &&
              !WhatsAppIdUtils.isLid(resolvedContact.id)
            ) {
              const realJid = WhatsAppIdUtils.getCleanJid(resolvedContact.id);
              console.info(
                `[MessageHandler] 🎯 Resolved via store: ${realJid}`,
              );
              if (realJid) {
                cleanRemoteJid = realJid;
                resolved = true;
              }
            }
          }

          // STEP 3: Active resolution via WhatsApp API (the same method WhatsApp Web uses)
          if (!resolved) {
            console.info(
              `[MessageHandler] 🔄 Attempting active WhatsApp API resolution...`,
            );
            const realPhone = await this.sessionManager.resolveLidToPhone(
              sessionId,
              cleanRemoteJid,
            );
            if (realPhone) {
              cleanRemoteJid = `${realPhone}@s.whatsapp.net`;
              console.info(
                `[MessageHandler] 🎯 Resolved via API: ${cleanRemoteJid}`,
              );
              resolved = true;
            }
          }

          if (!resolved) {
            console.warn(
              `[MessageHandler] ⚠️ LID could not be resolved: ${cleanRemoteJid}`,
            );
          }
        }

        const isGroup = WhatsAppIdUtils.isGroup(cleanRemoteJid);
        let isFromMe = message.key.fromMe || false;

        // 🛡️ 100-YEAR FIX: Robust "From Me" Detection
        // Baileys sometimes fails to set fromMe=true for synced messages in groups (LID/Phone mismatch).
        // We manually verify if the sender (participant) matches the session owner.
        if (!isFromMe && isGroup && message.key.participant) {
          const senderPhone = WhatsAppIdUtils.getPhoneNumber(
            message.key.participant,
          );
          if (senderPhone && sessionPhone && senderPhone === sessionPhone) {
            isFromMe = true;
            console.info(
              `[MessageHandler] 🔧 Fixed isFromMe=true (Group Participant Match): ${senderPhone}`,
            );
          }
        }

        // 🛡️ ANTI-ECHO / SELF-CHAT PROTECTION (100-YEAR SOLUTION)
        // Detect if the remoteJid is the bot itself (Note to Self).
        // Check both direct Phone match and potential LID match if available.
        const sock = this.sessionManager.getSession(sessionId);
        const myJidRaw = sock?.user?.id;

        if (myJidRaw) {
          const myJid = WhatsAppIdUtils.getCleanJid(myJidRaw);
          if (cleanRemoteJid === myJid) {
            console.warn(
              `[MessageHandler] 🛡️ Ignoring Self-Chat (Note to Self) from ${cleanRemoteJid}`,
            );
            return;
          }
        }

        // 3. IDENTIFICAR CONVERSACIÓN (El "Room")
        // En WhatsApp, el remoteJid SIEMPRE es el ID de la conversación (sea user o grupo)
        // EXCEPTO en Broadcasts (que ignoraremos por ahora)
        const chatUniqueId = cleanRemoteJid.split("@")[0];
        const chatEmail = `${chatUniqueId}@whatsapp.user`; // Virtual email for conversation lookup

        // 4. IDENTIFICAR AL "OTRO" (El Cliente)
        // - Si es DM Inbound: El sender es el remoteJid
        // - Si es DM Outbound (fromMe): El destinatario es el remoteJid
        // - Si es Grupo: El remoteJid es el grupo.

        // Si el mensaje es OUTBOUND (fromMe), NO creamos un usuario "You".
        // Asumimos que el sistema o un agente lo envió.
        let customerUser: User | null = null;

        if (!isFromMe) {
          // Es INBOUND. Necesitamos asegurar que el remitente existe como contacto.
          // Para Grupos, el remitente real es el participant. Para DMs, es el remoteJid.
          let senderJid = WhatsAppIdUtils.getSenderJid(message);

          // 🛡️ 100-YEAR FIX: Resolve Sender LID to Phone
          if (senderJid && WhatsAppIdUtils.isLid(senderJid)) {
            const resolvedSender =
              this.sessionManager.findContactByLid(senderJid);
            if (resolvedSender?.id) {
              const realSenderJid = WhatsAppIdUtils.getCleanJid(
                resolvedSender.id,
              );
              if (realSenderJid && !WhatsAppIdUtils.isLid(realSenderJid)) {
                senderJid = realSenderJid;
              }
            }
          }
          const senderPhone = WhatsAppIdUtils.getPhoneNumber(senderJid);
          const pushName = message.pushName;

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
          }
        } else {
          // Es OUTBOUND (Sincronización desde celular).
          // No creamos sender. Pero necesitamos asegurar que la conversación existe con el CLIENTE.
          // En DM outbound, remoteJid es el cliente.
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
          // En Grupo Outbound, la conversación es el grupo, no necesitamos crear usuario "Grupo" aquí,
          // se maneja en la lógica de conv.
        }

        const lockKey = `conv:${companyId}:${chatUniqueId}`;

        // 🔒 Critical Section: Conversation Creation
        const conversation = await this.withLock(lockKey, async () => {
          let conv = await chatService.findConversation(
            companyId,
            chatUniqueId,
            chatEmail,
          );

          if (!conv) {
            // Si no existe, la creamos.
            // El userId inicial debe ser el CLIENTE (incluso si es outbound sync, queremos que el chat sea con el cliente)
            // Si es grupo, userId puede ser null o el primer participante detectado.

            let conversationSubject = message.pushName || chatUniqueId;

            // 🏢 100-YEAR FIX: Enhanced Group Detection with Metadata
            let groupMetadata:
              | {
                  groupName?: string;
                  description?: string;
                  participantCount?: number;
                  groupPicUrl?: string | null;
                }
              | undefined;

            if (isGroup) {
              // For groups, use a better name format
              conversationSubject = `📢 Grupo ${chatUniqueId.slice(0, 8)}...`;

              // Try to fetch group metadata from WhatsApp (async, non-blocking)
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
                      groupPicUrl: undefined, // Can be fetched separately if needed
                    };
                  }
                }
              } catch {
                // Non-blocking - continue with basic group info
                console.warn(
                  `[MessageHandler] Could not fetch group metadata for ${cleanRemoteJid}`,
                );
              }
            }

            conv = await chatService.createConversation({
              companyId,
              channelId: chatUniqueId,
              subject: conversationSubject,
              userId: customerUser?.id || undefined, // undefined si es fromMe en grupo nuevo (raro)
              isGroup,
              groupMetadata,
            });
          }

          // Asegurar que el mensaje refresque el estado OPEN
          if (["CLOSED", "RESOLVED"].includes(conv.status)) {
            await chatService.updateConversation(conv.id, { status: "OPEN" });
          }
          return await chatService.getFullConversation(conv.id);
        });

        if (!conversation) return;

        // 6. Content Extraction
        // 🛡️ 100-YEAR FIX: Handle empty/protocol messages safely
        const contentData = await this.extractMessageContent(
          message,
          messageId,
        );

        // If content is null, it means it's an ignored type (protocol, reaction) or empty.
        // We skip persistence to avoid "Ghost Bubbles" in the UI.
        if (!contentData) {
          return;
        }

        const { textContent, mediaUrl, mediaType, mediaSize } = contentData;

        // 7. Message Persistence
        const isOutbound = isFromMe;

        // 🧠 HITL: Auto-Mute AI on Outbound (Agent) Message
        // If an agent (or system sync) sends a message, silence the AI to prevent interruptions.
        if (isOutbound) {
          try {
            await chatService.updateConversation(conversation.id, {
              aiEnabled: false,
              lastManualIntervention: new Date(),
            });
            // Update local object to reflect DB change immediately for this flow
            conversation.aiEnabled = false;
          } catch (err) {
            console.error("[HITL] Failed to auto-mute AI:", err);
          }
        }

        // Determinar SenderID para la DB
        // - Si es Inbound: customerUser.id
        // - Si es Outbound: Buscamos un Agente genérico o usamos el assignedTo de la conv, o null (sistema).
        //   Para mantener integridad FK, si es outbound y no tenemos agente mapeado desde el fono, usamos el sistema o el assignedTo.
        let dbSenderId = customerUser?.id;

        if (isOutbound) {
          // Es mensaje del negocio.
          // Idealmente deberíamos saber QUÉ agente lo envió (si tuviéramos mapeo de dispositivo).
          // Por ahora, usamos el assignedTo de la conversación o el primer admin/agente disponible,
          // OJO: upsertMessage requiere senderId valido.

          if (conversation.assignedToId) {
            dbSenderId = conversation.assignedToId;
          } else {
            // Fallback: Buscar cualquier agente o usar el mismo ID del cliente temporalmente (sucio pero evita crash)
            // MEJOR: Usar el customerUser si es INBOUND, pero si es OUTBOUND no podemos usar customerUser como sender.
            // Busquemos el "System User" o el dueño de la sesión.
            const sessionOwner = await prisma.user.findFirst({
              where: { phone: sessionPhone, companyId },
            });
            dbSenderId = sessionOwner?.id;

            if (!dbSenderId) {
              // Critical fallback: Si no encontramos al agente, lo asignamos al mismo usuario
              // para que al menos se guarde, aunque aparezca "a la derecha" visualmente por direction=OUTBOUND.
              // Aunque visualmente el frontend usa `senderType` o `direction`.
              // Vamos a buscar un agente default.
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
          senderId: dbSenderId || conversation.participants[0]?.id, // Safety net
          status: isOutbound ? "SENT" : "DELIVERED",
          metadata: prepareMetadataForDB(metadata),
          createdAt:
            typeof message.messageTimestamp === "number"
              ? new Date(message.messageTimestamp * 1000)
              : new Date(),
        });

        // 8. Real-time Events
        const fullConversation = await chatService.getFullConversation(
          conversation.id,
        );

        if (fullConversation) {
          if (isOutbound) {
            // Syncing message sent from phone -> Treat as "Message Sent" event
            this.socketEmitter.emitMessageSent(savedMessage, fullConversation);
          } else {
            // Incoming message -> New Message + Ticket Logic + AI
            // Ensure ticket exists logic...
            let ticketId = undefined;
            try {
              // Only create ticket for REAL incoming messages (not syncs)
              // FIX: Use customerUser instead of undefined senderUser
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
              console.error("Ticket error", e);
            }

            this.socketEmitter.emitMessageReceived(
              savedMessage,
              fullConversation,
              ticketId,
            );

            if (textContent && !isGroup) {
              // 🧠 HITL LOGIC: Check if AI is allowed to respond
              // We trust Prisma types are up to date
              const isAiEnabled = conversation.aiEnabled !== false; // Default true

              if (!isAiEnabled) {
                const lastIntervention = conversation.lastManualIntervention
                  ? new Date(conversation.lastManualIntervention)
                  : null;

                const GRACE_PERIOD_MS = 30 * 60 * 1000; // 30 Minutes
                const timeSinceIntervention = lastIntervention
                  ? Date.now() - lastIntervention.getTime()
                  : 0;

                if (
                  lastIntervention &&
                  timeSinceIntervention < GRACE_PERIOD_MS
                ) {
                  console.info(
                    `[HITL] 🔇 AI Silenced. Manual intervention was ${Math.round(timeSinceIntervention / 60000)}m ago.`,
                  );
                  return; // EXIT: Do not trigger AI
                } else {
                  console.info(
                    `[HITL] 🔊 Auto-Reactivating AI after grace period (${Math.round(timeSinceIntervention / 60000)}m)`,
                  );
                  // Reactivate in DB
                  await chatService.updateConversation(conversation.id, {
                    aiEnabled: true,
                  });
                }
              }

              // 🌊 FLOW ENGINE INTEGRATION
              let flowExecuted = false;
              if (customerUser?.phone) {
                try {
                  // Resolver contacto CRM asociado (required for flows)
                  const contact = await prisma.contact.findFirst({
                    where: { companyId, phone: customerUser.phone },
                  });

                  if (contact) {
                    const flowResults = await flowExecutor.processMessage(
                      contact.id,
                      textContent,
                      conversation.id,
                      companyId,
                    );

                    if (flowResults && flowResults.length > 0) {
                      flowExecuted = true;

                      // Process Flow Results
                      // Create a generic Bot User for sending flow messages
                      const botUser = await chatService.upsertWhatsAppUser({
                        email: `bot_${companyId}@reply.bot`,
                        name: "Flow Bot",
                        companyId,
                        role: "AGENT",
                      });

                      await TenantContextManager.run(
                        { companyId, userId: botUser.id, requestId: "flow" },
                        async () => {
                          for (const result of flowResults) {
                            if (typeof result === "string") {
                              await this.sendMessage(
                                conversation.channelId,
                                result,
                                {
                                  companyId,
                                  conversationId: conversation.id,
                                  senderId: botUser.id,
                                  metadata: { flowGenerated: true },
                                },
                              );
                            } else if (
                              result &&
                              typeof result === "object" &&
                              "type" in result
                            ) {
                              await this.sendMedia(
                                conversation.channelId,
                                {
                                  type: result.type,
                                  url: result.url,
                                  caption: result.message,
                                  mimetype:
                                    mime.lookup(result.url) ||
                                    "application/octet-stream",
                                },
                                {
                                  companyId,
                                  conversationId: conversation.id,
                                  senderId: botUser.id,
                                  metadata: { flowGenerated: true },
                                },
                              );
                            }
                          }
                        },
                      );
                    }
                  }
                } catch (err) {
                  console.error("[MessageHandler] Flow Execution Failed:", err);
                }
              }

              if (flowExecuted) return; // Si el flujo respondió, no activar IA standard

              // TODO: Enable AI for groups later if needed
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

  // Helper to ensure session data is available
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

  // Refactored Content Extraction for cleaner main method
  private async extractMessageContent(
    message: WAMessage,
    messageId: string,
  ): Promise<{
    textContent: string;
    mediaUrl?: string;
    mediaType?: MediaType | null;
    mediaSize?: number;
  } | null> {
    let textContent = "";
    let mediaUrl: string | undefined;
    let mediaSize = 0;
    let mediaType: MediaType | null = null;

    const messageType = Object.keys(message.message || {})[0];
    if (!messageType) return null; // Completely empty message

    // 🛡️ IGNORE PROTOCOL MESSAGES
    // These types create "Ghost Bubbles" if processed as text. We strictly ignore them.
    const ignoredTypes = [
      "protocolMessage",
      "senderKeyDistributionMessage",
      "reactionMessage",
      "keepInChatMessage",
      "pollUpdateMessage",
    ];

    if (ignoredTypes.includes(messageType)) {
      return null;
    }

    if (messageType === "conversation") {
      textContent = message.message?.conversation || "";
    } else if (messageType === "extendedTextMessage") {
      textContent = message.message?.extendedTextMessage?.text || "";
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
          // 🛡️ TYPE-SAFE: Access message content dynamically without `any`
          const content = message.message as unknown as Record<string, unknown>;
          const msgObj = content[messageType] as
            | Record<string, unknown>
            | undefined;

          textContent =
            (msgObj?.caption as string) ||
            (msgObj?.text as string) ||
            (msgObj?.fileName as string) ||
            `[${mapBaileysToMediaType(messageType)}]`;

          if (stream) {
            mediaType = mapBaileysToMediaType(messageType);
            // 🛡️ TYPE-SAFE: Explicit string cast for mimetype
            const mimetype: string =
              (msgObj?.mimetype as string | undefined) ||
              "application/octet-stream";
            const ext = mime.extension(mimetype) || "bin";
            const filename = `${messageId}.${ext}`;

            const uploadResult = await storageService.uploadStream(
              stream as Readable,
              filename,
              mimetype,
            );
            mediaUrl = uploadResult.url;
            mediaSize = Number(
              (msgObj?.fileLength as number | bigint | undefined) || 0,
            );
          }
        } catch (e) {
          console.error(`[media] Download failed for ${messageId}`, e);
        }
      } else {
        // Unsupported type (e.g. contactMessage, locationMessage) - fallback to text representation
        // Only if not ignored list
        // 🛡️ TYPE-SAFE: Access message content dynamically without `any`
        const content = message.message as unknown as Record<string, unknown>;
        const msgObj = content[messageType] as
          | Record<string, unknown>
          | undefined;
        // Try to grab some text description if possible
        if (msgObj) {
          textContent = `[${messageType}]`; // Placeholder for now
        }
      }
    }

    // Final sanity check: if no text and no media, it's a ghost message
    if (!textContent && !mediaUrl && !mediaType) {
      return null;
    }

    return { textContent, mediaUrl, mediaType, mediaSize };
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

    // 🛡️ 100-YEAR FIX: Memory-First session lookup (consistent with WhatsAppQueue)
    const activeSession =
      await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }
    const sock = activeSession.socket;

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

    // 🛡️ 100-YEAR FIX: Memory-First session lookup (consistent with WhatsAppQueue)
    const activeSession =
      await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }
    const sock = activeSession.socket;

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
