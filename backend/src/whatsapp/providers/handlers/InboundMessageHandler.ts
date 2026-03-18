import { WAMessage } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { WAMessageSchema } from "../../core/validation/baileys.schemas";
import { TenantContextManager } from "@/config/tenantContext";
import { chatService } from "@/services/chatService";
import { AITriggerService, ConversationWithQueue } from "../../services/AITriggerService";
import { mediaProcessor } from "../../services/MediaProcessorService";
import { InboundOrchestratorService } from "../../services/InboundOrchestratorService";
import { SocketEventEmitter } from "@/services/socketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { SessionData } from "@/types/whatsapp.types";
import { ISessionManager } from "../../core/interfaces/ISessionManager";

/**
 * 📨 INBOUND MESSAGE HANDLER
 *
 * Responsibilities:
 * - Validate incoming WhatsApp messages (Protocol level)
 * - Orchestrate entity resolution via InboundOrchestratorService
 * - Orchestrate message persistence & ticketing
 * - Emit Socket.IO events
 * - Trigger AI/Flow bots
 */
export class InboundMessageHandler {
  private socketEmitter: SocketEventEmitter;
  private sessionCache = new Map<string, SessionData>();
  private conversionQueues = new Map<string, Promise<void>>();

  constructor(
    private sessionManager: ISessionManager,
    private orchestrator: InboundOrchestratorService,
    private aiTrigger: AITriggerService,
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
      .catch((err: Error) => {
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

    try {
      await this.withLock(`msg:${messageId}`, async () => {
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
    const sessionData = await this.ensureSessionData(sessionId);
    if (!sessionData) return;

    const { companyId, userId: sessionPhone } = sessionData;

    await TenantContextManager.run(
      { companyId, userId: sessionPhone || "system", requestId: `msg:${messageId}` },
      async () => {
        // 1. Guard: Check if message exists
        if (await chatService.doesMessageExist(messageId)) return;

        // 2. Resolve Entities (User, Conversation, JIDs)
        const entities = await this.orchestrator.resolveEntities(message, sessionId, companyId, sessionPhone);
        if (!entities) return;

        // 3. Extract Content
        const contentData = await mediaProcessor.extractMessageContent(companyId, message, messageId);
        if (!contentData) return;

        // 4. Persist & Ticket
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

        // 5. Emit Events & Trigger AI
        const fullConversation = await chatService.getFullConversation(entities.conversation.id);
        if (fullConversation) {
          if (message.key.fromMe) {
            this.socketEmitter.emitMessageSent(savedMessage, fullConversation);
          } else {
            this.socketEmitter.emitMessageReceived(savedMessage, fullConversation, ticketId);
            
            // AI Trigger (non-group)
            if (contentData.textContent && !entities.isGroup) {
              await this.aiTrigger.processInboundTriggers(
                fullConversation as ConversationWithQueue,
                contentData.textContent,
                companyId,
                entities.cleanRemoteJid,
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
    let sessionData = this.sessionCache.get(sessionId);
    if (!sessionData) {
      const session =
        await whatsappSessionRepository.findSystemSession(sessionId);
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
