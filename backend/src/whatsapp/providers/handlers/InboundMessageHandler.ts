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
    // [SEC] CRITICAL DEDUPLICATION: Skip own echoes (Sent from Reply)
    if (message.key.fromMe) {
      const isEcho = await deduplicationService.isOwnEcho(messageId);
      if (isEcho) {
        Logger.debug(`[InboundHandler] ⏭️ Skipping own echo: ${messageId}`);
        return;
      }
    }

    // Guard: Check if message exists in DB BEFORE heavy orchestration
    if (await chatService.doesMessageExist(messageId)) {
      Logger.debug(`[InboundHandler] ⏭️ Skipping existing message: ${messageId}`);
      return;
    }

    const sessionData = await this.ensureSessionData(sessionId);
    if (!sessionData) return;

    const { companyId, userId: sessionPhone } = sessionData;

    await TenantContextManager.run(
      { companyId, userId: sessionPhone || "system", requestId: `msg:${messageId}` },
      async () => {
        // 2. Resolve Entities (User, Conversation, JIDs)
        const entities = await this.orchestrator.resolveEntities(message, sessionId, companyId, sessionPhone);
        if (!entities) return;

        // 3. Extract Content (Handle Media/Text)
        const contentData = await mediaProcessor.extractMessageContent(companyId, message, messageId);
        if (!contentData) return;

        // [SEC] CRITICAL ECHO FIX: Skip echoes where Baileys ID didn't match but content did!
        if (message.key.fromMe && contentData.textContent) {
           // Guard against corrupted byte-sequences
          if (/^\d+(,\d+){5,}$/.test(contentData.textContent.trim())) {
             return;
          }

          const isContentDup = await deduplicationService.isContentDuplicate(entities.conversation.id, contentData.textContent);
          if (isContentDup) {
            Logger.info(`[InboundHandler] ⏭️ Skipping own echo by CONTENT match: ${messageId}`);
            return;
          }
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

        if (!result) return;
        const { savedMessage, ticketId } = result;

        // 5. Real-time Delivery & AI Trigger
        const fullConversation = await chatService.getFullConversation(companyId, entities.conversation.id);
        if (fullConversation) {
          if (entities.isFromMe) {
            this.socketEmitter.emitMessageSent(savedMessage, fullConversation, ticketId);
          } else {
            this.socketEmitter.emitMessageReceived(savedMessage, fullConversation, ticketId);
            
            // AI Trigger Execution (SLA Aware)
            if (contentData.textContent && !entities.isGroup) {
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
        }
      }
    );
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
