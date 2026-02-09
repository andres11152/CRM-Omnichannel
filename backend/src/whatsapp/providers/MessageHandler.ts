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
  downloadMediaMessage,
  WAMessage,
  AnyMessageContent,
  WAMessageUpdate,
  generateMessageID,
} from "@whiskeysockets/baileys";
import { gateway } from "@/gateways/socketGateway";
import { TenantContextManager } from "@/config/tenantContext";
import { SocketEventEmitter } from "@/services/socketEventEmitter";
import { generateAIResponse } from "@/services/aiResponseService";
import { storageService } from "@/services/storageService";
import mime from "mime-types";
import { Readable } from "stream";
import { convertAudioToMP4, cleanupTempFile } from "@/utils/audioConverter";
import fs from "fs";
import { WhatsAppIdUtils } from "../utils/WhatsAppIdUtils";

import { chatService } from "@/services/chatService";
// import { contactService } from "@/services/contactService"; // Removed unused import
import { SessionData, MessageMetadata } from "@/types/whatsapp.types";
import { Conversation, Queue, MediaType, Prisma, User } from "@prisma/client";
import { AIResponseSchema } from "@/types/ai.types";
import { flowExecutor } from "@/services/flowExecutor";

type ConversationWithQueue = Conversation & {
  queue: (Queue & { aiAssistantId: string | null }) | null;
  participants: User[];
  assignedTo: User | null;
};

const mapBaileysToMediaType = (baileysType: string): MediaType => {
  const type = baileysType.toLowerCase();
  if (type.includes("image")) return MediaType.IMAGE;
  if (type.includes("video")) return MediaType.VIDEO;
  if (type.includes("audio")) return MediaType.AUDIO;
  return MediaType.DOCUMENT;
};

const prepareMetadataForDB = (meta: MessageMetadata): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(meta));
};

export class MessageHandler implements IMessageHandler {
  private eventBus: EventBus;
  private sessionCache = new Map<string, SessionData>();
  private conversionQueues = new Map<string, Promise<void>>();
  private recentSentMessageIds = new Set<string>();
  private recentSentContent = new Set<string>();
  private socketEmitter: SocketEventEmitter;

  constructor(private sessionManager: ISessionManager) {
    this.eventBus = EventBus.getInstance();
    this.socketEmitter = new SocketEventEmitter(gateway);
    this.subscribeToEvents();
  }

  private async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.conversionQueues.get(key) || Promise.resolve();

    const resultPromise = previous
      .then(() => task())
      .catch((err) => {
        console.error(`[Mutex] Critical task failure for ${key}:`, err);
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

  async handlePresenceUpdate(
    data: WhatsAppEventData[WhatsAppEventType.PRESENCE_UPDATE],
    sessionId: string,
  ): Promise<void> {
    const { id: remoteJid, presences } = data;
    // 🛡️ Safety: Ensure data integrity
    if (!remoteJid || !presences) return;

    const participant = Object.keys(presences)[0];
    if (!participant) return;

    const presence = presences[participant];
    const status = (presence.lastKnownPresence || "paused") as
      | "composing"
      | "recording"
      | "paused";

    // Debug Log: Presence Received
    console.info(`[Presence] 📥 Event from ${remoteJid}: ${status}`);

    const sessionData = await this.ensureSessionData(sessionId);
    if (!sessionData) {
      console.warn(`[Presence] ⚠️ SessionData missing for ${sessionId}`);
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
        let targetJid = originalJid;

        // 🛡️ STRATEGY 1: Resolve LID to Phone (Primary)
        if (WhatsAppIdUtils.isLid(originalJid)) {
          console.info(`[Presence] 🔍 Resolving LID ${originalJid}...`);
          // 🛡️ RETRY LOGIC FOR PRESENCE TOO
          for (let i = 0; i < 5; i++) {
            const resolved = this.sessionManager.findContactByLid(originalJid);
            if (resolved?.id) {
              const real = WhatsAppIdUtils.getCleanJid(resolved.id);
              if (real && !WhatsAppIdUtils.isLid(real)) {
                targetJid = real;
                break;
              }
            }
            // Wait briefly if not found immediately (though presence updates usually mean we have data)
            await new Promise((r) => setTimeout(r, 200));
          }
        }

        // 🛡️ DOUBLE LOOKUP: Try Phone First, Then Fallback to LID
        const chatUniqueId = targetJid.split("@")[0];

        // Look up by Target JID (Phone)
        let conv = await chatService.findConversation(
          sessionData.companyId,
          chatUniqueId,
          `${chatUniqueId}@whatsapp.user`,
        );

        // Look up by Original JID (LID) if different and first attempt failed
        if (!conv && targetJid !== originalJid) {
          console.warn(
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
          console.info(`[Presence] 📡 Emitting ${status} to Chat ${conv.id}`);
          // ✅ SUCCESS: Found conversation, emit using its ID
          this.socketEmitter.emitConversationTyping(
            conv.id,
            sessionData.companyId,
            targetJid, // Send resolved JID if possible, or original
            status,
          );
        } else {
          console.warn(
            `[Presence] ❌ Conversation NOT FOUND. Original: ${originalJid}, Target: ${targetJid}, Company: ${sessionData.companyId}`,
          );
        }
      },
    );
  }

  async handleIncoming(message: WAMessage, sessionId: string): Promise<void> {
    const messageId = message.key?.id;
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
        if (await chatService.doesMessageExist(messageId)) {
          return;
        }

        const rawRemoteJid = message.key.remoteJid;
        let cleanRemoteJid = WhatsAppIdUtils.getCleanJid(rawRemoteJid);

        if (!cleanRemoteJid) {
          console.warn(`[MessageHandler] Invalid JID: ${rawRemoteJid}`);
          return;
        }

        if (WhatsAppIdUtils.isLid(cleanRemoteJid)) {
          console.info(`[MessageHandler] 🔍 LID Detected: ${cleanRemoteJid}`);

          let resolved = false;

          const messageKey = message.key as {
            remoteJidAlt?: string;
            senderPn?: string;
          };

          if (
            messageKey.remoteJidAlt &&
            messageKey.remoteJidAlt.includes("@s.whatsapp.net") &&
            !messageKey.remoteJidAlt.includes("@lid")
          ) {
            cleanRemoteJid =
              WhatsAppIdUtils.getCleanJid(messageKey.remoteJidAlt) ||
              cleanRemoteJid;
            resolved = true;
          }

          if (
            !resolved &&
            messageKey.senderPn &&
            messageKey.senderPn.includes("@s.whatsapp.net") &&
            !messageKey.senderPn.includes("@lid")
          ) {
            cleanRemoteJid =
              WhatsAppIdUtils.getCleanJid(messageKey.senderPn) ||
              cleanRemoteJid;
            resolved = true;
          }

          const participant = message.key.participant;
          if (!resolved && participant && !WhatsAppIdUtils.isLid(participant)) {
            cleanRemoteJid =
              WhatsAppIdUtils.getCleanJid(participant) || cleanRemoteJid;
            resolved = true;
          }

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
                cleanRemoteJid =
                  WhatsAppIdUtils.getCleanJid(param) || cleanRemoteJid;
                resolved = true;
                break;
              }
            }
          }

          if (!resolved) {
            const resolvedContact =
              this.sessionManager.findContactByLid(cleanRemoteJid);
            if (
              resolvedContact?.id &&
              !WhatsAppIdUtils.isLid(resolvedContact.id)
            ) {
              const realJid = WhatsAppIdUtils.getCleanJid(resolvedContact.id);
              if (realJid) {
                cleanRemoteJid = realJid;
                resolved = true;
              }
            }
          }

          if (!resolved) {
            // 🛡️ REINTRODUCING RETRY LOGIC FOR LID RESOLUTION
            // Wait for history sync to populate SimpleStore
            let realPhone = null;
            for (let i = 0; i < 10; i++) {
              realPhone = await this.sessionManager.resolveLidToPhone(
                sessionId,
                cleanRemoteJid,
              );
              if (realPhone) break;
              await new Promise((r) => setTimeout(r, 500));
            }

            if (realPhone) {
              // Extract original LID before overwriting cleanRemoteJid
              const originalLidBase = cleanRemoteJid.split("@")[0];
              cleanRemoteJid = `${realPhone}@s.whatsapp.net`;
              resolved = true;
              console.info(
                `[MessageHandler] 🎯 Retried & Resolved LID ${cleanRemoteJid}`,
              );
              // 🛡️ PERSIST the LID -> Phone mapping for future lookups
              await chatService.saveLidPhoneMapping(
                companyId,
                originalLidBase,
                realPhone,
              );
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
          let senderJid = WhatsAppIdUtils.getSenderJid(message);

          if (
            !isGroup &&
            cleanRemoteJid &&
            !WhatsAppIdUtils.isLid(cleanRemoteJid)
          ) {
            senderJid = cleanRemoteJid;
          }

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

            this.fetchAndPersistProfilePicture(
              sessionId,
              senderJid,
              customerUser.id,
            ).catch((err) =>
              console.warn(
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

          // 🛡️ 100-YEAR FIX: LID Unification
          // If we have a LID and no conversation found, we need to:
          // 1. Check if there's an existing conversation with the REAL phone number
          // 2. If found, use that conversation instead of creating a duplicate
          // 3. Store the LID -> Phone mapping for future lookups
          if (!conv && WhatsAppIdUtils.isLid(cleanRemoteJid)) {
            console.info(
              `[MessageHandler] 🔍 LID Conversation not found, searching for real phone conversation...`,
            );

            // Strategy 0: Base definition
            const lidBase = chatUniqueId;

            // Strategy 1: 🛡️ DATABASE LID LOOKUP (Most Reliable)
            // Check if we have a LID -> Phone mapping stored in DB (survives restarts)
            if (!conv) {
              console.info(
                `[MessageHandler] 🔍 Strategy 1: DB LID lookup for ${lidBase}`,
              );
              conv = await chatService.findConversationByLid(
                companyId,
                lidBase,
              );
              if (conv) {
                console.info(
                  `[MessageHandler] 🎯 Strategy 1 SUCCESS: Found conv ${conv.id} via persisted LID mapping`,
                );
              }
            }

            // Strategy 3: Try to actively resolve the LID one more time with direct query
            if (!conv) {
              console.info(
                `[MessageHandler] 🔄 Final attempt to resolve LID ${lidBase} via active query...`,
              );
              const sock = this.sessionManager.getSession(sessionId);

              if (sock) {
                try {
                  // Use Baileys' onWhatsApp to resolve the LID
                  // Note: This might not work for LIDs directly, but worth trying
                  const fullLidJid = `${lidBase}@lid`;
                  const resolvedPhone =
                    await this.sessionManager.resolveLidToPhone(
                      sessionId,
                      fullLidJid,
                    );

                  if (resolvedPhone) {
                    console.info(
                      `[MessageHandler] ✅ Actively resolved LID ${lidBase} -> ${resolvedPhone}`,
                    );
                    const realChannelId = resolvedPhone.replace(/\D/g, "");
                    const realChatEmail = `${realChannelId}@whatsapp.user`;

                    // 🛡️ PERSIST the LID -> Phone mapping for future lookups
                    await chatService.saveLidPhoneMapping(
                      companyId,
                      lidBase,
                      resolvedPhone,
                    );

                    // Now search for the real conversation
                    conv = await chatService.findConversation(
                      companyId,
                      realChannelId,
                      realChatEmail,
                    );

                    if (conv) {
                      console.info(
                        `[MessageHandler] 🎯 Found existing conversation ${conv.id} for resolved phone ${realChannelId}`,
                      );
                    }
                  }
                } catch (resErr) {
                  console.warn(
                    `[MessageHandler] ⚠️ Active LID resolution failed:`,
                    resErr,
                  );
                }
              }
            }

            // Strategy 4: Name Heuristic (Last Resort)
            // If we have a pushName and the message is INBOUND (so pushName is the contact)
            if (!conv && message.pushName && !isFromMe) {
              console.info(
                `[MessageHandler] 🔍 Trying Name Heuristic for LID: ${message.pushName}`,
              );

              // Find users with this name in the company
              const possibleUsers = await prisma.user.findMany({
                where: {
                  companyId,
                  name: { contains: message.pushName, mode: "insensitive" },
                },
                take: 5,
              });

              console.info(
                `[MessageHandler] 🔍 Found ${possibleUsers.length} users matching name "${message.pushName}"`,
              );

              for (const user of possibleUsers) {
                // Check if we have ANY conversation with this user (OPEN or CLOSED)
                const userConv = await prisma.conversation.findFirst({
                  where: {
                    companyId,
                    participants: { some: { id: user.id } },
                    // Removed status: "OPEN" restriction to find historical chats too
                  },
                  orderBy: { updatedAt: "desc" },
                });

                if (userConv) {
                  conv = await chatService.getFullConversation(userConv.id);
                  console.info(
                    `[MessageHandler] 🎯 Heuristic Match: Found conv ${conv.id} by name ${message.pushName}`,
                  );
                  break;
                }
              }
            }

            // Strategy 4.5: Brute Force Store Search
            // Sometimes lidToPhone map is empty, but the Contact object exists in store with LID
            // We iterate contacts to find one with this LID
            if (!conv) {
              // 🛡️ NO ANY ALLOWED: Strict Typing for Store Access
              type ContactStore = {
                contacts: Record<string, { lid?: string; id?: string }>;
              };
              const store = this.sessionManager.getSessionStore(
                sessionId,
              ) as ContactStore;

              if (store && store.contacts) {
                const storeContacts = store.contacts;
                for (const jid in storeContacts) {
                  const c = storeContacts[jid];
                  if (
                    c.lid === cleanRemoteJid ||
                    (c.lid && c.lid.startsWith(lidBase))
                  ) {
                    // Found contact!
                    const phoneJid = jid; // Key is phone JID
                    if (phoneJid.includes("@s.whatsapp.net")) {
                      const realChannelId = phoneJid.replace(/\D/g, "");
                      const realChatEmail = `${realChannelId}@whatsapp.user`;
                      console.info(
                        `[MessageHandler] 🎯 Brute Force Store Match: ${cleanRemoteJid} -> ${phoneJid}`,
                      );
                      conv = await chatService.findConversation(
                        companyId,
                        realChannelId,
                        realChatEmail,
                      );
                      if (conv) break;
                    }
                  }
                }
              }
            }

            // Strategy 5: UNIVERSAL LID FALLBACK
            // For ANY message with unresolved LID, try to find the most recent active conversation.
            // This prevents both duplicate creation AND message loss.
            if (!conv) {
              console.warn(
                `[MessageHandler] 🚨 LID ${lidBase} completely unresolved. fromMe=${isFromMe}. Searching for recent conversation...`,
              );

              // Strategy 5a: Find the most recently active conversation for this company
              const recentConv = await prisma.conversation.findFirst({
                where: {
                  companyId,
                  isGroup: false,
                  // 🛡️ REVISION: Removed 'status: OPEN' and increased lookback to 24h
                  // This prevents "New Chat" creation for ongoing/recent dialogues,
                  // complying with user requirement to "make it work like before".
                  updatedAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                  }, // Last 24 hours
                },
                orderBy: { updatedAt: "desc" },
              });

              if (recentConv) {
                console.info(
                  `[MessageHandler] 🎯 FALLBACK SUCCESS: Using conversation ${recentConv.id} for unresolved LID ${lidBase}`,
                );
                conv = await chatService.getFullConversation(recentConv.id);
              } else {
                console.warn(
                  `[MessageHandler] ⚠️ No recent conversation found for LID ${lidBase}. Will create new (unavoidable).`,
                );
                // For inbound messages, we MUST create to not lose messages.
                // For outbound, this is rare but acceptable as last resort.
              }
            }
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
                console.warn(
                  `[MessageHandler] Could not fetch group metadata for ${cleanRemoteJid}`,
                );
              }
            }

            // Note: Strategy 5 check removed here to be restored in its original position.

            // Note: Inbound Strategy 5 remains disabled for safety.
            // If we're here with !conv, create a NEW conversation.
            // If we're here with !conv, it means Strategy 5 didn't find a recent conversation,
            // so we MUST create one to not lose the message.

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
          // 🛡️ 100-YEAR FIX: Database-level Deduplication
          // Prevents duplication when Baileys event ID mismatch occurs or race conditions persist
          const recentThreshold = new Date(Date.now() - 10000); // 10 seconds lookback
          const existingDuplicate = await prisma.message.findFirst({
            where: {
              conversationId: conversation.id,
              direction: "OUTBOUND",
              content: textContent,
              createdAt: { gt: recentThreshold },
            },
          });

          if (existingDuplicate) {
            console.info(
              `[MessageHandler] 🛡️ Ignoring duplicate outbound message (DB Detect): ${messageId} | matches ${existingDuplicate.id}`,
            );
            return;
          }

          // 🛡️ MEMORY DEDUP: Check Content Hash (Fastest Path)
          if (textContent) {
            const dedupKey = this.getDedupKey(conversation.id, textContent);
            if (this.recentSentContent.has(dedupKey)) {
              console.info(
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
              console.error("Ticket error", e);
            }

            this.socketEmitter.emitMessageReceived(
              savedMessage,
              fullConversation,
              ticketId,
            );

            if (textContent && !isGroup) {
              let flowExecuted = false;
              const flowPhone =
                customerUser?.phone ||
                WhatsAppIdUtils.getPhoneNumber(cleanRemoteJid);

              if (flowPhone) {
                try {
                  let contact = await prisma.contact.findFirst({
                    where: { companyId, phone: flowPhone },
                  });

                  if (!contact) {
                    try {
                      contact = await prisma.contact.create({
                        data: {
                          companyId,
                          phone: flowPhone,
                          name: pushName || "Usuario WhatsApp",
                          tags: ["WHATSAPP_LEAD", "AUTO_CREATED"],
                        },
                      });
                    } catch (e) {
                      contact = await prisma.contact.findFirst({
                        where: { companyId, phone: flowPhone },
                      });
                    }
                  }

                  if (contact) {
                    const flowResults = await flowExecutor.processMessage(
                      contact.id,
                      textContent,
                      conversation.id,
                      companyId,
                    );

                    if (flowResults && flowResults.length > 0) {
                      flowExecuted = true;
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

              if (flowExecuted) return;

              const isAiEnabled = conversation.aiEnabled !== false;

              if (!isAiEnabled) {
                const lastIntervention = conversation.lastManualIntervention
                  ? new Date(conversation.lastManualIntervention)
                  : null;

                const GRACE_PERIOD_MS = 10 * 60 * 1000;
                const timeSinceIntervention = lastIntervention
                  ? Date.now() - lastIntervention.getTime()
                  : 0;

                if (
                  lastIntervention &&
                  timeSinceIntervention < GRACE_PERIOD_MS
                ) {
                  return;
                } else {
                  await chatService.updateConversation(conversation.id, {
                    aiEnabled: true,
                  });
                }
              }

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
    if (!messageType) return null;

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
        const content = message.message as unknown as Record<string, unknown>;
        const msgObj = content[messageType] as
          | Record<string, unknown>
          | undefined;
        if (msgObj) {
          textContent = `[${messageType}]`;
        }
      }
    }

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

    const thinkingTime = Math.floor(Math.random() * 1000) + 1000;
    await new Promise((r) => setTimeout(r, thinkingTime));

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

      const typingTime = Math.min(
        Math.max(cleanResponse.length * 50, 1500),
        8000,
      );

      await this.sendPresenceUpdate(
        conversation.channelId,
        "composing",
        companyId,
      );

      await new Promise((r) => setTimeout(r, typingTime));

      const aiAssistant = await prisma.aIAssistant.findUnique({
        where: { id: conversation.queue.aiAssistantId },
        select: { name: true },
      });
      const botName = aiAssistant?.name || "AI Assistant";

      const botEmail = `ai_${conversation.queue.aiAssistantId}@reply.bot`;
      const botUser = await chatService.upsertWhatsAppUser({
        email: botEmail,
        name: botName,
        companyId,
        role: "AGENT",
      });

      await TenantContextManager.run(
        { companyId, userId: botUser.id, requestId: "ai" },
        async () => {
          await this.sendPresenceUpdate(
            conversation.channelId,
            "paused",
            companyId,
          );

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

    const activeSession =
      await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }
    const sock = activeSession.socket;

    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    const generatedId = generateMessageID();
    // 🛡️ RACE CONDITION FIX: Track ID *before* sending to prevent duplicate processing by event handler
    this.recentSentMessageIds.add(generatedId);
    setTimeout(() => this.recentSentMessageIds.delete(generatedId), 10000);

    // 🛡️ CONTENT DEDUP: Track content to handle ID mismatch Scenarios
    const dedupKey = this.getDedupKey(conversationId, content);
    this.recentSentContent.add(dedupKey);
    setTimeout(() => this.recentSentContent.delete(dedupKey), 10000);

    const sentMsg = await sock.sendMessage(
      jid,
      { text: content },
      { messageId: generatedId },
    );
    // Note: sentMsg.key.id should match generatedId if Baileys respects it.
    // If not, we track whatever it returns (but pre-tracking relies on respect).

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
        console.info(
          `[HITL] ✅ AI muted for conversation ${conversationId} (human agent intervention)`,
        );
      } catch (err) {
        console.error("[HITL] Failed to auto-mute AI:", err);
      }
    } else {
      console.info(
        `[HITL] ⏩ Skipping AI mute - message is ${isAiGenerated ? "AI-generated" : "Flow-generated"}`,
      );
    }

    await chatService.updateConversation(conversationId, {});
    const fullConv = await chatService.getFullConversation(conversationId);
    if (fullConv) this.socketEmitter.emitMessageSent(savedMessage, fullConv);

    return savedMessage as unknown as MessagePayload;
  }

  async sendMedia(
    to: string,
    media: MediaPayload,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    const { companyId, conversationId, senderId } = options;

    const activeSession =
      await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }
    const sock = activeSession.socket;

    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

    let messageContent: AnyMessageContent;
    let metaType: "image" | "video" | "audio" | "document";
    let tempFilePath: string | null = null;
    if (media.url && media.url.startsWith("/api/")) {
      const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
      const cleanBackendUrl = backendUrl.replace(/\/$/, "");
      media.url = `${cleanBackendUrl}${media.url}`;
    }

    const isHttp =
      media.url.startsWith("http://") || media.url.startsWith("https://");
    const isData = media.url.startsWith("data:");

    if (!isHttp && !isData) {
      if (!fs.existsSync(media.url)) {
        console.error(
          `[MessageHandler] ❌ Local media file not found: ${media.url}`,
        );
        const warningContent = media.caption
          ? `${media.caption}\n\n(⚠️ Audio no disponible: Archivo no encontrado en el servidor)`
          : `(⚠️ Audio no disponible: Archivo no encontrado en el servidor)`;

        return this.sendMessage(to, warningContent, options);
      }
    }

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
        let realMimeType = media.mimetype;
        const isBase64 = media.url.startsWith("data:");

        const proxyMatch = !isBase64
          ? media.url.match(/\/api\/media\/([^/]+)\/content/)
          : null;
        if (proxyMatch && proxyMatch[1]) {
          try {
            const mediaId = proxyMatch[1];
            const dbMedia = await prisma.media.findUnique({
              where: { id: mediaId },
              select: { mimeType: true },
            });
            if (dbMedia?.mimeType) {
              realMimeType = dbMedia.mimeType;
            }
          } catch (err) {
            console.warn(
              `[MessageHandler] ⚠️ Failed to resolve MIME from DB:`,
              err,
            );
          }
        }

        const isWebM =
          realMimeType === "audio/webm" ||
          media.url.toLowerCase().endsWith(".webm");
        const needsConversion = isBase64 || isWebM;

        if (needsConversion) {
          try {
            const inputSource = media.url;
            tempFilePath = await convertAudioToMP4(inputSource);
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
            messageContent = {
              audio: { url: media.url },
              mimetype: realMimeType || "audio/ogg; codecs=opus",
              ptt: true,
            };
          }
        } else {
          const isMp3 =
            realMimeType === "audio/mpeg" ||
            realMimeType === "audio/mp3" ||
            media.url.toLowerCase().endsWith(".mp3");

          let finalMime = "audio/ogg; codecs=opus";
          let isPtt = true;

          if (isMp3) {
            finalMime = "audio/mpeg";
            isPtt = false;
          } else if (
            realMimeType &&
            realMimeType !== "application/octet-stream"
          ) {
            finalMime = realMimeType;
            if (finalMime === "audio/ogg" && !finalMime.includes("codecs")) {
              finalMime = "audio/ogg; codecs=opus";
            }
          }

          messageContent = {
            audio: { url: media.url },
            mimetype: finalMime,
            ptt: isPtt,
          };
        }

        metaType = "audio";
      } else if (media.type === "sticker") {
        messageContent = { sticker: { url: media.url } };
        metaType = "image";
      } else if (media.type === "file" || media.type === "document") {
        let docMime = "application/octet-stream";
        let fileName = "document";

        const proxyMatch = media.url.match(/\/api\/media\/([^/]+)\/content/);
        if (proxyMatch && proxyMatch[1]) {
          try {
            const mediaId = proxyMatch[1];
            const dbMedia = await prisma.media.findUnique({
              where: { id: mediaId },
              select: { mimeType: true, filename: true },
            });
            if (dbMedia?.mimeType) docMime = dbMedia.mimeType;
            if (dbMedia?.filename) fileName = dbMedia.filename;
          } catch (e) {
            console.warn(
              "[MessageHandler] Failed to resolve document metadata",
              e,
            );
          }
        }

        messageContent = {
          document: { url: media.url },
          mimetype: docMime,
          fileName: fileName,
          caption: media.caption || "",
        };
        metaType = "document";
      } else {
        throw new Error(`Unsupported media type: ${media.type}`);
      }

      const generatedId = generateMessageID();
      // 🛡️ RACE CONDITION FIX: Track ID *before* sending media
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

      const metadata = options.metadata;
      const isAiGenerated = metadata?.aiGenerated === true;
      const isFlowGenerated = metadata?.flowGenerated === true;

      if (!isAiGenerated && !isFlowGenerated) {
        try {
          await chatService.updateConversation(conversationId, {
            aiEnabled: false,
            lastManualIntervention: new Date(),
          });
          console.info(
            `[HITL] ✅ AI muted for conversation ${conversationId} (human agent sent media)`,
          );
        } catch (err) {
          console.error("[HITL] Failed to auto-mute AI:", err);
        }
      } else {
        console.info(
          `[HITL] ⏩ Skipping AI mute for media - ${isAiGenerated ? "AI-generated" : "Flow-generated"}`,
        );
      }

      await chatService.updateConversation(conversationId, {});
      const fullConv = await chatService.getFullConversation(conversationId);
      if (fullConv) this.socketEmitter.emitMessageSent(savedMessage, fullConv);

      return savedMessage as unknown as MessagePayload;
    } catch (err) {
      console.error(`[MessageHandler] ❌ sendMedia failed unexpectedly:`, err);
      const warningContent = `(⚠️ Error enviando archivo multimedia: ${media.type})`;
      return this.sendMessage(to, warningContent, options);
    } finally {
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

  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    // 🛡️ REVERTED: Usage disabled per user request to restore stability.
    // Logic removed to match state "before typing feature was requested".
    return Promise.resolve();
  }

  private async fetchAndPersistProfilePicture(
    sessionId: string,
    jid: string,
    userId: string,
  ): Promise<void> {
    try {
      const sock = this.sessionManager.getSession(sessionId);
      if (!sock) {
        console.warn(`[ProfilePic] No socket for session ${sessionId}`);
        return;
      }

      const normalizedJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;

      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { profilePicUrl: true },
      });

      if (
        existingUser?.profilePicUrl &&
        existingUser.profilePicUrl.startsWith("http")
      ) {
        return;
      }

      let profilePicUrl: string | undefined;

      try {
        profilePicUrl = await sock.profilePictureUrl(normalizedJid, "image");
      } catch {
        try {
          profilePicUrl = await sock.profilePictureUrl(
            normalizedJid,
            "preview",
          );
        } catch {
          console.info(
            `[ProfilePic] No profile picture available for ${normalizedJid}`,
          );
          return;
        }
      }

      if (!profilePicUrl) return;

      await prisma.user.update({
        where: { id: userId },
        data: { profilePicUrl },
      });

      console.info(
        `[ProfilePic] ✅ Saved profile picture for user ${userId}: ${profilePicUrl.slice(0, 60)}...`,
      );
    } catch (error) {
      console.warn(`[ProfilePic] Failed to fetch/save profile pic:`, error);
    }
  }

  private getDedupKey(conversationId: string, content: string): string {
    return `${conversationId}:${content.trim()}`;
  }
}
