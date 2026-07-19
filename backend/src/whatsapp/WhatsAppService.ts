/**
 * WHATSAPP SERVICE
 *
 * Core orchestrator for WhatsApp integration.
 * Manages: initialization, session lifecycle, event wiring, sync.
 * Messaging logic delegated to WhatsAppMessaging.
 * Session logic delegated to WhatsAppSessionService.
 */

import { ISessionManager } from "./core/interfaces/ISessionManager";
import { IMessageHandler } from "./core/interfaces/IMessageHandler";
import { RateLimitService } from "./services/RateLimitService";
import { EventBus } from "./core/events/EventBus";
import {
  SendMessageOptions,
  MessagePayload,
  SessionStatus,
} from "./core/types/whatsapp.types";
import { WASocket, Contact } from "@whiskeysockets/baileys";
import { whatsappServiceHttp } from "./utils/whatsAppServiceHttp";
import { Logger } from "@/utils/logger";

import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { container } from "@/config/container";
import { WA_TOKENS } from "./di/tokens";
import { registerWhatsAppServices } from "./di/registration";
import { WhatsAppMessaging } from "./services/WhatsAppMessaging";
import { WhatsAppSessionService } from "./services/WhatsAppSessionService";
import { WhatsAppEventWiring } from "./services/WhatsAppEventWiring";

export class WhatsAppService {
  private static instance: WhatsAppService;

  private sessionManager: ISessionManager;
  private messageHandler: IMessageHandler;
  private rateLimitService: RateLimitService;
  private eventBus: EventBus;
  private sessionRepository: WhatsAppSessionRepository;
  
  private messaging: WhatsAppMessaging;
  private sessionService: WhatsAppSessionService;

  private constructor() {
    // Bootstrap DI container (Composition Root)
    registerWhatsAppServices();

    // Resolve all dependencies from container
    this.eventBus = container.resolve(WA_TOKENS.EventBus);
    this.sessionManager = container.resolve(WA_TOKENS.SessionManager);
    this.messageHandler = container.resolve(WA_TOKENS.MessageHandler);
    this.rateLimitService = container.resolve(WA_TOKENS.RateLimitService);
    this.sessionRepository = new WhatsAppSessionRepository();

    // Initialize sub-services
    this.messaging = new WhatsAppMessaging(
      this.sessionManager,
      this.messageHandler,
      this.rateLimitService,
    );

    this.sessionService = new WhatsAppSessionService(
      this.sessionManager,
      this.sessionRepository,
    );

    // Setup Event Wiring
    const eventWiring = new WhatsAppEventWiring(
      this.eventBus,
      this.sessionRepository,
      this.messageHandler,
      this.sessionManager,
    );
    eventWiring.setupEventHandlers();
  }

  static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  // ────────────────────────────────────────────────
  // INITIALIZATION
  // ────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const redisClient = (await import("@/config/redis")).default;
    if (redisClient) {
      try {
        const subscriber = redisClient.duplicate();
        await subscriber.connect();
        await subscriber.subscribe("whatsapp:events", (message) => {
          try {
            const event = JSON.parse(message);
            if (event.timestamp) {
              event.timestamp = new Date(event.timestamp);
            }
            Logger.info(`[WhatsAppService] Redis PubSub received event ${event.type} for session ${event.sessionId}`);
            this.eventBus.publish(event);
          } catch (jsonErr) {
            Logger.error("[WhatsAppService] Redis PubSub JSON parse failed:", jsonErr);
          }
        });
        Logger.info("[WhatsAppService] [OK] Subscribed to Redis PubSub whatsapp:events channel");
      } catch (err) {
        Logger.error("[WhatsAppService] Failed to duplicate/connect Redis subscriber:", err);
      }
    }
  }

  // ────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ────────────────────────────────────────────────

  async createSession(
    companyId: string,
    sessionId?: string,
    meta?: {
      provider?: "BAILEYS" | "META";
      metaAccessToken?: string;
      metaPhoneNumberId?: string;
      metaBusinessId?: string;
      metaVerifyToken?: string;
    }
  ): Promise<{ sessionId: string; qrCode: string | null }> {
    const res = await whatsappServiceHttp.post(`/sessions`, {
      companyId,
      sessionId,
      provider: meta?.provider,
      metaAccessToken: meta?.metaAccessToken,
      metaPhoneNumberId: meta?.metaPhoneNumberId,
      metaBusinessId: meta?.metaBusinessId,
      metaVerifyToken: meta?.metaVerifyToken,
    });
    return res.data;
  }

  async requestPairingCode(
    companyId: string,
    phone: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; code: string | null }> {
    const res = await whatsappServiceHttp.post(`/sessions`, {
      companyId,
      sessionId,
      phone,
    });
    return res.data;
  }

  async deleteSession(companyId: string, sessionId: string): Promise<void> {
    await whatsappServiceHttp.delete(`/sessions/${sessionId}`, {
      data: { clearAuth: true },
    });
  }

  getSessionManager(): ISessionManager {
    return this.sessionManager;
  }

  // ────────────────────────────────────────────────
  // SESSION QUERIES
  // ────────────────────────────────────────────────

  async getSessions(companyId: string) {
    const res = await whatsappServiceHttp.get(`/sessions/${companyId}`);
    return res.data;
  }

  async updateSession(
    companyId: string,
    sessionId: string,
    data: { defaultQueueId?: string | null; proxyUrl?: string | null },
  ) {
    const updated = await this.sessionService.updateSession(companyId, sessionId, data);
    if (data.proxyUrl !== undefined) {
      await whatsappServiceHttp.post(`/sessions`, {
        companyId,
        sessionId,
        proxyUrl: data.proxyUrl,
      }).catch((e) => Logger.error("Failed to notify microservice about proxy change:", e));
    }
    return updated;
  }

  async listSessions(companyId: string): Promise<SessionStatus[]> {
    const res = await whatsappServiceHttp.get(`/sessions/${companyId}`);
    return res.data;
  }

  async getSession(companyId: string, sessionId: string): Promise<SessionStatus> {
    const res = await whatsappServiceHttp.get(`/sessions/status/${sessionId}`);
    return res.data;
  }

  async getSessionRecord(companyId: string, sessionId: string) {
    return this.sessionRepository.findOne(companyId, sessionId);
  }

  getSocket(sessionId: string): WASocket | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  // ────────────────────────────────────────────────
  // MESSAGING (Delegated to WhatsAppMessaging)
  // ────────────────────────────────────────────────

  /**
   * @deprecated Usa `whatsappMessagingService.sendMessage` en su lugar (ISP - SOLID).
   */
  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    return this.messaging.sendMessage(to, content, options);
  }

  /**
   * @deprecated Usa `whatsappMessagingService.executeQueuedMessage` en su lugar.
   */
  async executeQueuedMessage(
    sessionId: string,
    to: string,
    content: string,
    options: SendMessageOptions & { dbId?: string },
  ) {
    return this.messaging.executeQueuedMessage(sessionId, to, content, options);
  }

  /**
   * @deprecated Usa `whatsappMessagingService.simulateTyping` en su lugar.
   */
  async simulateTyping(sessionId: string, to: string) {
    return this.messaging.simulateTyping(sessionId, to);
  }

  /**
   * @deprecated Usa `whatsappMessagingService.sendPresenceUpdate` en su lugar.
   */
  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    return this.messaging.sendPresenceUpdate(to, type, companyId);
  }

  /**
   * @deprecated Usa `whatsappMessagingService.sendReaction` en su lugar.
   */
  async sendReaction(
    to: string,
    messageId: string,
    reaction: string,
    companyId: string,
    fromMe?: boolean,
  ): Promise<void> {
    return this.messaging.sendReaction(to, messageId, reaction, companyId, fromMe);
  }

  /**
   * @deprecated Usa `whatsappMessagingService.sendTemplate` en su lugar.
   */
  async sendTemplate(
    to: string,
    templateId: string,
    params: Record<string, string>,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    return this.messaging.sendTemplate(to, templateId, params, options);
  }

  // ────────────────────────────────────────────────
  // RECONNECT & SYNC
  // ────────────────────────────────────────────────

  async reconnectSession(companyId: string, sessionId: string): Promise<void> {
    await whatsappServiceHttp.post(`/sessions/${sessionId}/reconnect`);
  }

  async syncMessages(
    companyId: string,
    fromDate: Date,
    userId?: string,
    limit?: number,
  ): Promise<{
    success: boolean;
    messagesNew: number;
    messagesDuplicate: number;
    errors: string[];
  }> {
    const { chatSyncService, ChatSyncRequestSchema } = await import("@/services/ChatSyncService");

    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }

    const request = ChatSyncRequestSchema.parse({
      companyId,
      sessionId: activeSession.sessionId,
      sinceDate: fromDate.toISOString(),
      limit: limit || 500,
      dryRun: false,
    });

    const result = await chatSyncService.syncMessages(request, userId || "system");
    return {
      success: result.success,
      messagesNew: result.messagesNew,
      messagesDuplicate: result.messagesDuplicate,
      errors: result.errors,
    };
  }

  getSessionStore(sessionId: string): {
    chats: Map<string, import("@whiskeysockets/baileys").Chat>;
    messages: Record<string, import("@whiskeysockets/baileys").proto.IWebMessageInfo[]>;
    contacts: Record<string, Contact>;
    lidToPhone: Record<string, string>;
  } | null {
    return this.sessionManager.getSessionStore(sessionId);
  }

  async isCompanyConnected(companyId: string): Promise<boolean> {
    return this.sessionService.isCompanyConnected(companyId);
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }
}

export const whatsappService = WhatsAppService.getInstance();
