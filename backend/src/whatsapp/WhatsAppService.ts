/**
 * WHATSAPP SERVICE
 *
 * Core orchestrator for WhatsApp integration.
 * Manages: initialization, session lifecycle, event wiring, sync.
 * Messaging logic delegated to WhatsAppMessaging.
 */

import { ISessionManager } from "./core/interfaces/ISessionManager";
import { IMessageHandler } from "./core/interfaces/IMessageHandler";
import { RateLimitService } from "./services/RateLimitService";
import { EventBus } from "./core/events/EventBus";
import { WhatsAppEventType, WhatsAppEvent } from "./core/events/WhatsAppEvents";
import {
  SendMessageOptions,
  MessagePayload,
  SessionStatus,
} from "./core/types/whatsapp.types";
import { TenantContextManager } from "@/config/tenantContext";
import { Logger } from "@/utils/logger";
import { WASocket } from "@whiskeysockets/baileys";

import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { AppError } from "@/utils/AppError";
// DI Container
import { container } from "@/config/container";
import { WA_TOKENS } from "./di/tokens";
import { registerWhatsAppServices } from "./di/registration";
import { WhatsAppMessaging } from "./services/WhatsAppMessaging";

export class WhatsAppService {
  private static instance: WhatsAppService;

  private sessionManager: ISessionManager;
  private messageHandler: IMessageHandler;
  private rateLimitService: RateLimitService;
  private eventBus: EventBus;
  private sessionRepository: WhatsAppSessionRepository;
  private messaging: WhatsAppMessaging;

  private constructor() {
    // Bootstrap DI container (Composition Root)
    registerWhatsAppServices();

    // Resolve all dependencies from container
    this.eventBus = container.resolve(WA_TOKENS.EventBus);
    this.sessionManager = container.resolve(WA_TOKENS.SessionManager);
    this.messageHandler = container.resolve(WA_TOKENS.MessageHandler);
    this.rateLimitService = container.resolve(WA_TOKENS.RateLimitService);
    this.sessionRepository = new WhatsAppSessionRepository();

    // Initialize messaging sub-service
    this.messaging = new WhatsAppMessaging(
      this.sessionManager,
      this.messageHandler,
      this.rateLimitService,
    );

    this.setupEventHandlers();
  }

  static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  // ────────────────────────────────────────────────
  // EVENT WIRING
  // ────────────────────────────────────────────────

  private setupEventHandlers(): void {
    this.eventBus.on(
      WhatsAppEventType.SESSION_CONNECTED,
      async (event: WhatsAppEvent<WhatsAppEventType.SESSION_CONNECTED>) => {
        Logger.info(`[WA] Session connected: ${event.sessionId}`);
        try {
          await this.sessionRepository.update(
            event.companyId,
            event.sessionId,
            {
              status: "CONNECTED",
            },
          );
          const { gateway } = await import("@/gateways/socketGateway");
          gateway.emitToCompany(event.companyId, "whatsapp:connected", {
            sessionId: event.sessionId,
          });
        } catch (err) {
          Logger.error("[WA] Error handling session_connected:", err);
        }
      },
    );

    this.eventBus.on(
      WhatsAppEventType.SESSION_DISCONNECTED,
      async (event: WhatsAppEvent<WhatsAppEventType.SESSION_DISCONNECTED>) => {
        Logger.warn(`[WA] Session disconnected: ${event.sessionId}`);
        try {
          await this.sessionRepository
            .update(event.companyId, event.sessionId, {
              status: "DISCONNECTED",
            })
            .catch((dbErr: { code?: string }) => {
              // P2025: Record not found (e.g., after cleanup). Safe to ignore.
              if (dbErr?.code === "P2025") {
                Logger.warn(
                  `[WA] Session ${event.sessionId} already removed from DB, skipping update.`,
                );
                return;
              }
              throw dbErr;
            });
          const { gateway } = await import("@/gateways/socketGateway");
          gateway.emitToCompany(event.companyId, "whatsapp:disconnected", {
            sessionId: event.sessionId,
            reason: event.data.reason,
          });
        } catch (err) {
          Logger.error("[WA] Error handling session_disconnected:", err);
        }
      },
    );

    this.eventBus.on(
      WhatsAppEventType.SESSION_QR_CODE,
      async (event: WhatsAppEvent<WhatsAppEventType.SESSION_QR_CODE>) => {
        try {
          const { gateway } = await import("@/gateways/socketGateway");
          gateway.emitToCompany(event.companyId, "whatsapp:qr", {
            sessionId: event.sessionId,
            qrCode: event.data.qr,
          });
        } catch (err) {
          Logger.error("[WA] Error emitting QR:", err);
        }
      },
    );

    this.eventBus.on(
      WhatsAppEventType.MESSAGE_RECEIVED,
      async (event: WhatsAppEvent<WhatsAppEventType.MESSAGE_RECEIVED>) => {
        const { companyId, sessionId } = event;
        try {
          await TenantContextManager.run(
            {
              companyId,
              userId: "system",
              requestId: `wa:msg:${event.data.message?.key?.id || "unknown"}`,
            },
            async () => {
              await this.messageHandler.handleIncoming(event.data.message, sessionId, companyId);
            },
          );
        } catch (err) {
          Logger.error(`[WA] Error processing message for ${sessionId}:`, err);
        }
      },
    );
  }

  // ────────────────────────────────────────────────
  // INITIALIZATION
  // ────────────────────────────────────────────────

  async initialize(): Promise<void> {
    Logger.info("[WA] Initializing WhatsApp Service...");

    try {
      // Bypassing RLS for system-wide session restoration
      await TenantContextManager.runAsSystem(async () => {
        const sessions = await this.sessionRepository.findByStatus("CONNECTED");

        if (sessions.length === 0) {
          Logger.info("[WA] No sessions to restore.");
          return;
        }

        Logger.info(`[WA] Restoring ${sessions.length} sessions...`);

        for (const session of sessions) {
          try {
            Logger.info(
              `[WA] Restoring session ${session.sessionId} (Company: ${session.companyId})`,
            );
            await this.sessionManager.initializeSession({
              sessionId: session.sessionId,
              companyId: session.companyId,
            });
            Logger.info(`[WA] Restored: ${session.sessionId}`);
          } catch (err) {
            Logger.error(`[WA] ERROR: Failed to restore ${session.sessionId}:`, err);
            await this.sessionRepository
              .update(session.companyId, session.sessionId, { status: "ERROR" })
              .catch(() => {});
          }
        }
      });

      Logger.info("[WA] Session restoration complete.");
    } catch (err) {
      Logger.error("[WA] ERROR: Initialization error:", err);
    }
  }

  // ────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ────────────────────────────────────────────────

  async createSession(
    companyId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; qrCode: string | null }> {
    // ANTI-DUPLICATION LOGIC: 
    // Check if we already have a session for this company that isn't fully established.
    // If we do, we REUSE it to avoid filling the UI with "Connecting..." ghosts.
    let finalSessionId = sessionId;
    
    if (!finalSessionId) {
      const existingSessions = await this.sessionRepository.findByCompany(companyId);
      const ghostSession = existingSessions.find(s => 
        ["CONNECTING", "QR", "ERROR", "DISCONNECTED"].includes(s.status)
      );

      if (ghostSession) {
        Logger.info(`[WA] Recycling ghost session: ${ghostSession.sessionId} for company ${companyId}`);
        finalSessionId = ghostSession.sessionId;
      } else {
        finalSessionId = `wa_${companyId}_${Date.now().toString(36)}`;
      }
    }

    Logger.info(
      `[WA] Creating/Updating session ${finalSessionId} for company ${companyId}`,
    );

    // Check plan limits (only for NEW rows, but recycling is safe)
    try {
      const { planLimitsService } =
        await import("@/services/PlanLimitsService");
      
      const existing = await this.sessionRepository.findOne(companyId, finalSessionId);
      if (!existing) {
        const canCreate = await planLimitsService.canCreateResource(
          companyId,
          "whatsapp_sessions",
        );
        if (!canCreate) {
          throw new AppError(
            "Has alcanzado el límite de conexiones WhatsApp de tu plan.",
            403,
          );
        }
      }
    } catch (planErr) {
      if (
        planErr &&
        typeof planErr === "object" &&
        "statusCode" in planErr &&
        (planErr as { statusCode: number }).statusCode === 403
      )
        throw planErr;
      Logger.warn(
        "[WA] Plan limits check skipped (service unavailable):",
        planErr,
      );
    }

    // PERSISTENCE: Ensure the session record exists in DB BEFORE initializing Baileys.
    try {
      const session = await this.sessionRepository.findOne(companyId, finalSessionId);
      if (session) {
        await this.sessionRepository.update(companyId, finalSessionId, {
          status: "CONNECTING",
          qrCode: null, // Reset QR if recycling
        });
      } else {
        await this.sessionRepository.create({
          sessionId: finalSessionId,
          company: { connect: { id: companyId } },
          status: "CONNECTING",
        });
      }
    } catch (err) {
      Logger.error(`[WA] Error ensuring session record for ${finalSessionId}:`, err);
    }

    // Create Baileys session
    await this.sessionManager.initializeSession({
      sessionId: finalSessionId,
      companyId,
    });

    // Wait for QR or connection
    return new Promise((resolve) => {
      let resolved = false;

      const handler = (
        event: WhatsAppEvent<WhatsAppEventType.SESSION_QR_CODE>,
      ) => {
        if (event.sessionId === finalSessionId && event.data.qr && !resolved) {
          resolved = true;
          this.eventBus.off(WhatsAppEventType.SESSION_QR_CODE, handler);
          resolve({
            sessionId: finalSessionId,
            qrCode: event.data.qr,
          });
        }
      };

      this.eventBus.on(WhatsAppEventType.SESSION_QR_CODE, handler);

      // Connection race: resolve immediately if already connected
      setTimeout(async () => {
        if (!resolved) {
          const sessions = await this.sessionRepository.findByStatus(
            "CONNECTED",
            [companyId],
          );
          const isConnected = sessions.some(
            (s) => s.sessionId === finalSessionId,
          );

          if (isConnected && !resolved) {
            resolved = true;
            this.eventBus.off(WhatsAppEventType.SESSION_QR_CODE, handler);
            resolve({ sessionId: finalSessionId, qrCode: null });
          }
        }
      }, 3000);

      // Timeout: resolve without QR if nothing happens
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.eventBus.off(WhatsAppEventType.SESSION_QR_CODE, handler);
          resolve({ sessionId: finalSessionId, qrCode: null });
        }
      }, 15000);
    });
  }

  async deleteSession(companyId: string, sessionId: string): Promise<void> {
    Logger.info(`[WA] Requested deletion for session ${sessionId} (Company: ${companyId})`);
    
    try {
      // 1. Try a graceful termination (this clears memory and auth tokens)
      // We wrap it to prevent session-logout-timeouts from blocking the entire flow
      await Promise.race([
        this.sessionManager.terminateSession(sessionId, true),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Termination timeout")), 15000))
      ]).catch(err => {
        Logger.warn(`[WA] Graceful termination for ${sessionId} timed out or failed, proceeding with local cleanup.`, err);
      });
    } catch (err) {
      Logger.error(`[WA] Error during terminateSession for ${sessionId}:`, err);
    }

    // 2. ABSOLUTE CLEANUP: Ensure record is removed from DB regardless of socket state
    try {
      await this.sessionRepository.delete(companyId, sessionId);
      Logger.info(`[WA] Session record ${sessionId} removed from DB.`);
    } catch (dbErr) {
      Logger.error(`[WA] ERROR: Failed to delete session record ${sessionId} from DB:`, dbErr);
      throw new AppError("No se pudo eliminar el registro de la sesión. Intente nuevamente.", 500);
    }
  }

  // ────────────────────────────────────────────────
  // SESSION QUERIES
  // ────────────────────────────────────────────────

  async getSessions(companyId: string) {
    return this.sessionRepository.findByCompany(companyId);
  }

  async updateSessionQueue(
    companyId: string,
    sessionId: string,
    queueId: string | null,
  ) {
    const session = await this.sessionRepository.findOne(companyId, sessionId);
    if (!session) {
      throw new AppError("Session not found or unauthorized", 404);
    }

    return this.sessionRepository.update(companyId, sessionId, {
      defaultQueue: queueId
        ? { connect: { id: queueId } }
        : { disconnect: true },
    });
  }

  async listSessions(companyId: string): Promise<SessionStatus[]> {
    return this.sessionManager.listSessions(companyId);
  }

  async getSession(companyId: string, sessionId: string): Promise<SessionStatus> {
    const record = await this.sessionRepository.findOne(companyId, sessionId);
    if (!record) {
      throw new AppError("No session found or unauthorized", 404);
    }
    return this.sessionManager.getSessionStatus(sessionId);
  }

  async getSessionRecord(companyId: string, sessionId: string) {
    return this.sessionRepository.findOne(companyId, sessionId);
  }

  /**
   * Expose Raw Socket
   * Necessary for advanced operations like Group Metadata, Blocklist, etc.
   */
  getSocket(sessionId: string): WASocket | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  // ────────────────────────────────────────────────
  // MESSAGING (Delegated to WhatsAppMessaging)
  // ────────────────────────────────────────────────

  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    return this.messaging.sendMessage(to, content, options);
  }

  async executeQueuedMessage(
    sessionId: string,
    to: string,
    content: string,
    options: SendMessageOptions & { dbId?: string },
  ) {
    return this.messaging.executeQueuedMessage(sessionId, to, content, options);
  }

  async simulateTyping(sessionId: string, to: string) {
    return this.messaging.simulateTyping(sessionId, to);
  }

  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    return this.messaging.sendPresenceUpdate(to, type, companyId);
  }

  async sendReaction(
    to: string,
    messageId: string,
    reaction: string,
    companyId: string,
    fromMe?: boolean,
  ): Promise<void> {
    return this.messaging.sendReaction(to, messageId, reaction, companyId, fromMe);
  }

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
    const record = await this.sessionRepository.findOne(companyId, sessionId);
    if (!record) {
      throw new AppError("Session not found or unauthorized", 404);
    }
    await this.sessionManager.reconnectSession(sessionId);
  }

  /**
   * SYNC MESSAGES FROM PHONE HISTORY
   * Historical message synchronization.
   * Delegates to ChatSyncService for actual processing.
   */
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
    const { chatSyncService, ChatSyncRequestSchema } =
      await import("@/services/ChatSyncService");

    const activeSession =
      await this.sessionManager.findActiveSessionForCompany(companyId);
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

    const result = await chatSyncService.syncMessages(
      request,
      userId || "system",
    );
    return {
      success: result.success,
      messagesNew: result.messagesNew,
      messagesDuplicate: result.messagesDuplicate,
      errors: result.errors,
    };
  }

  /**
   * GET SESSION STORE
   * Returns the Baileys in-memory store for a session.
   */
  getSessionStore(sessionId: string): unknown {
    return this.sessionManager.getSessionStore(sessionId);
  }

  /**
   * CHECK COMPANY CONNECTION (Memory-First)
   */
  async isCompanyConnected(companyId: string): Promise<boolean> {
    if (this.sessionManager.hasActiveSessionInMemory(companyId)) {
      return true;
    }

    const sessions = await this.sessionRepository.findByStatus("CONNECTED", [
      companyId,
    ]);
    return sessions.length > 0;
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }
}

export const whatsappService = WhatsAppService.getInstance();
