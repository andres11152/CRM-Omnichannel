import { WAMessage } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { deduplicationService } from "../../services/DeduplicationService";
import { WAMessageSchema } from "../../core/validation/baileys.schemas";
import { TenantContextManager } from "@/config/tenantContext";
import { chatService } from "@/services/ChatService";
import { AITriggerService, ConversationWithQueue } from "../../services/AITriggerService";
import { mediaProcessor } from "../../services/MediaProcessorService";
import { InboundOrchestratorService } from "../../services/InboundOrchestratorService";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { SessionData } from "@/types/whatsapp.types";
import { ISessionManager } from "../../core/interfaces/ISessionManager";
import { LockService } from "@/utils/LockService";
import NodeCache from "node-cache";
import { messageRepository } from "@/repositories/MessageRepository";
import { Prisma } from "@prisma/client";

/**
 *  INBOUND MESSAGE HANDLER (Audit Hardened)
 *
 * Responsibilities:
 * - Validate incoming WhatsApp messages (Protocol level)
 * - Orchestrate entity resolution via InboundOrchestratorService
 * - Orchestrate message persistence & ticketing
 * - Emit Socket.IO events
 * - Trigger AI/Flow bots
 * - Distributed Locking (Redlock) for Deduplication
 */
export class InboundMessageHandler {
  private socketEmitter: SocketEventEmitter;
  // [SEC] MEMORY HARDENING: Using NodeCache with 1h TTL to avoid leaks
  private sessionCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

  constructor(
    private sessionManager: ISessionManager,
    private orchestrator: InboundOrchestratorService,
    private aiTrigger: AITriggerService,
  ) {
    this.socketEmitter = new SocketEventEmitter(gateway);
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

    console.log(`[DEBUG-RAW] Incoming msg: ${rawMessage?.key?.id}`, JSON.stringify(rawMessage?.message, null, 2));

    Logger.info(
      `[InboundHandler] Entered handleIncoming for message: ${rawMessage?.key?.id}`,
    );

    // [SEC] Zod Validation
    const validated = WAMessageSchema.safeParse(rawMessage);
    if (!validated.success) {
      Logger.warn(`[InboundHandler] [WARNING] Invalid WAMessage structure dropped`, {
        sessionId,
        errors: validated.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      return;
    }

    const messageId = rawMessage.key?.id;
    if (!rawMessage || !rawMessage.message || !messageId) {
      return;
    }

    try {
      // [SEC] DISTRIBUTED LOCK (Redlock-lite)
      // Prevents race conditions across multiple workers/instancias
      await LockService.withLock(`msg:${messageId}`, async () => {
        await this.processIncomingMessage(rawMessage, sessionId, messageId);
      });
    } catch (error: unknown) {
      console.error(`[DEBUG-FLOW] 🚨 CAUGHT EXCEPTION IN handleIncoming for ${messageId}:`, error);
      Logger.error(
        `[InboundHandler] Error processing incoming message ${messageId}:`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  // ────────────────────────────────────────────────
  // PROCESS INCOMING MESSAGE (Orchestration)
  // ────────────────────────────────────────────────

  private async processIncomingMessage(
    message: WAMessage,
    sessionId: string,
    messageId: string,
  ): Promise<void> {
    console.log(`[DEBUG-FLOW] processIncomingMessage START for ${messageId}`);
    const sessionData = await this.ensureSessionData(sessionId);
    if (!sessionData) {
      console.log(`[DEBUG-FLOW] ❌ DROPPED: No session data for ${messageId}`);
      return;
    }
    const { companyId, userId: sessionPhone } = sessionData;
    console.log(`[DEBUG-FLOW] Session loaded for ${messageId}: Company ${companyId}`);

    // ─── PIN EVENT HANDLING (messages.upsert) ───
    const messageContentObj = message.message;
    console.log(`[DEBUG-FLOW] Message keys: ${Object.keys(messageContentObj || {}).join(", ")}`);
    
    interface PinMessage {
      key?: { id?: string };
      type?: number;
    }

    if (messageContentObj && messageContentObj.pinInChatMessage) {
      console.log(`[DEBUG-FLOW] 📌 Identified as PIN event for ${messageId}`);
      const pinMsg = messageContentObj.pinInChatMessage as PinMessage;
      const pinnedMessageId = pinMsg?.key?.id;
      
      if (pinnedMessageId) {
        const isPinned = !pinMsg.type || pinMsg.type === 1; // 1 = PIN, 2 = UNPIN
        
        try {
          const msg = await TenantContextManager.runAsSystem(() =>
            messageRepository.findMessageByWhatsAppId(pinnedMessageId, companyId),
          );

          // Resolve conversationId from JID if msg not found (crucial for unpinning old messages)
          let conversationId = msg?.conversationId;
          if (!conversationId) {
            const remoteJid = message.key.remoteJid;
            if (remoteJid) {
               const conv = await TenantContextManager.runAsSystem(() => 
                 chatService.findOrCreateConversationByJid(companyId, remoteJid)
               );
               conversationId = conv.id;
            }
          }

          if (msg) {
            const existingMeta = (msg.metadata as Prisma.JsonObject) || {};
            const updatedMeta: Prisma.JsonObject = {
              ...existingMeta,
              isPinned,
              pinnedAt: isPinned ? new Date().toISOString() : null,
            };

            await TenantContextManager.runAsSystem(() =>
              messageRepository.updateByWhatsAppId(pinnedMessageId, companyId, {
                metadata: updatedMeta,
              }),
            );
          }

          // ALWAYS emit if we have a conversationId (to clear the UI banner)
          if (conversationId) {
            this.socketEmitter.emitMessagePinned(
              msg?.id || pinnedMessageId,
              conversationId,
              companyId,
              isPinned,
              msg?.content || (isPinned ? "Mensaje de WhatsApp" : ""), // Placeholder for unknown messages
              msg?.senderId || "",
            );
            Logger.info(`[InboundHandler] [PIN] Message ${pinnedMessageId} ${isPinned ? "PINNED" : "UNPINNED"}. UI sync emitted.`);
          }
        } catch (error) {
          Logger.error(`[InboundHandler] [PIN] Failed to process pin event:`, error);
        }
      }
      return; // Stop further processing, it's just an event
    }

    // [SEC] CRITICAL DEDUPLICATION: Skip own echoes (Sent from Reply)
    console.log(`[DEBUG-FLOW] Checking echo status: fromMe=${message.key.fromMe}`);
    if (message.key.fromMe) {
      const isEcho = await deduplicationService.isOwnEcho(messageId);
      if (isEcho) {
        console.log(`[DEBUG-FLOW] ⏭️ Skipping own echo: ${messageId}`);
        return;
      }
      console.log(`[DEBUG-FLOW] Message is fromMe but NOT an echo: ${messageId}`);
    }

    // Guard: Check if message exists in DB BEFORE heavy orchestration
    console.log(`[DEBUG-FLOW] Checking if message exists in DB: ${messageId}`);
    const exists = await chatService.doesMessageExist(messageId);
    if (exists) {
      console.log(`[DEBUG-FLOW] ⏭️ Skipping existing message: ${messageId}`);
      return;
    }
    console.log(`[DEBUG-FLOW] Message is NEW: ${messageId}`);



    console.log(`[DEBUG-FLOW] 🚀 Entering TenantContextManager for ${messageId}`);
    await TenantContextManager.run(
      { companyId, userId: sessionPhone || "system", requestId: `msg:${messageId}` },
      async () => {
        console.log(`[DEBUG-FLOW] Resolving entities for ${messageId}`);
        // 2. Resolve Entities (User, Conversation, JIDs)
        const entities = await this.orchestrator.resolveEntities(message, sessionId, companyId, sessionPhone);
        if (!entities) {
          console.log(`[DEBUG-FLOW] ❌ DROPPED: Failed to resolve entities for message ${messageId}`);
          return;
        }

        // 3. Extract Content (Handle Media/Text) — pass live socket for reuploadRequest
        const contentData = await mediaProcessor.extractMessageContent(
          companyId,
          message,
          messageId,
          sessionId,
          (sid) => this.sessionManager.getSession(sid),
        );
        if (!contentData) {
          console.log(`[DEBUG-FLOW] ❌ DROPPED: Failed to extract content for message ${messageId}`);
          return;
        }

        // [SEC] CRITICAL ECHO FIX: Skip echoes where Baileys ID didn't match but content did!
        if (message.key.fromMe && contentData.textContent) {
           // Guard against corrupted byte-sequences
          if (/^\d+(,\d+){5,}$/.test(contentData.textContent.trim())) {
             return;
          }

          const isContentDup = await deduplicationService.isContentDuplicate(entities.conversation.id, contentData.textContent);
          if (isContentDup) {
            console.log(`[DEBUG-FLOW] ⏭️ Skipping own echo by CONTENT match: ${messageId}`);
            return;
          }
          console.log(`[DEBUG-FLOW] Content is NOT a duplicate for ${messageId}`);
        }

        // 4. Persist & Ticket (Database Level)
        const result = await this.orchestrator.saveMessageAndTicket({
          message,
          messageId,
          entities,
          content: contentData,
          companyId,
          sessionId,
          sessionPhone,
          defaultQueueId: sessionData.defaultQueueId,
        });

        if (!result) {
          console.log(`[DEBUG-FLOW] ❌ DROPPED: Failed to save message and ticket for ${messageId}`);
          return;
        }
        console.log(`[DEBUG-FLOW] ✅ Message saved successfully: ${messageId}`);
        const { savedMessage, ticketId } = result;

        // 5. Real-time Delivery & AI Trigger
        console.log(`[DEBUG-FLOW] Fetching full conversation for ${entities.conversation.id}`);
        const fullConversation = await chatService.getFullConversation(companyId, entities.conversation.id);
        if (fullConversation) {
          console.log(`[DEBUG-FLOW] Full conversation found for ${messageId}`);
          if (entities.isFromMe) {
            console.log(`[DEBUG-FLOW] 📤 Emitting message.sent for ${messageId}`);
            this.socketEmitter.emitMessageSent(savedMessage, fullConversation, ticketId);
          } else {
            console.log(`[DEBUG-FLOW] 📥 Emitting message.received for ${messageId}`);
            this.socketEmitter.emitMessageReceived(savedMessage, fullConversation, ticketId);
            
            // AI Trigger Execution (SLA Aware)
            if (contentData.textContent && !entities.isGroup) {
              console.log(`[DEBUG-FLOW] 🤖 Triggering AI for ${messageId}`);
              await this.aiTrigger.processInboundTriggers(
                fullConversation as ConversationWithQueue,
                contentData.textContent,
                companyId,
                entities.cleanRemoteJid,
                entities.remoteJid,
                entities.customerUser,
                message.pushName
              );
            }
          }
        } else {
          console.log(`[DEBUG-FLOW] ❌ DROPPED: Full conversation NOT FOUND for ${entities.conversation.id}`);
        }
        
        console.log(`[DEBUG-FLOW] 🏁 Finished TenantContextManager callback for ${messageId}`);
      }
    );
    
    Logger.info(`[InboundHandler] ✅ Successfully reached end of processIncomingMessage for ${messageId}`);
  }

  async ensureSessionData(sessionId: string): Promise<SessionData | null> {
    let sessionData = this.sessionCache.get<SessionData>(sessionId);
    if (!sessionData) {
      const session = await whatsappSessionRepository.findSystemSession(sessionId);
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
}
