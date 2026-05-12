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
      this.eventBus,
      this.sessionRepository,
    );

    // Setup Event Wiring
    const eventWiring = new WhatsAppEventWiring(
      this.eventBus,
      this.sessionRepository,
      this.messageHandler,
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
    return this.sessionService.initialize();
  }

  // ────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ────────────────────────────────────────────────

  async createSession(
    companyId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; qrCode: string | null }> {
    return this.sessionService.createSession(companyId, sessionId);
  }

  async deleteSession(companyId: string, sessionId: string): Promise<void> {
    return this.sessionService.deleteSession(companyId, sessionId);
  }

  getSessionManager(): ISessionManager {
    return this.sessionManager;
  }

  // ────────────────────────────────────────────────
  // SESSION QUERIES
  // ────────────────────────────────────────────────

  async getSessions(companyId: string) {
    return this.sessionService.getSessions(companyId);
  }

  async updateSessionQueue(
    companyId: string,
    sessionId: string,
    queueId: string | null,
  ) {
    return this.sessionService.updateSessionQueue(companyId, sessionId, queueId);
  }

  async listSessions(companyId: string): Promise<SessionStatus[]> {
    return this.sessionService.listSessions(companyId);
  }

  async getSession(companyId: string, sessionId: string): Promise<SessionStatus> {
    return this.sessionService.getSession(companyId, sessionId);
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
    return this.sessionService.reconnectSession(companyId, sessionId);
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
