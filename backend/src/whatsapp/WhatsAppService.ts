import { ISessionManager } from "./core/interfaces/ISessionManager";
import { IMessageHandler } from "./core/interfaces/IMessageHandler";
import { IAuthProvider } from "./core/interfaces/IAuthProvider";
import { SessionManager } from "./providers/SessionManager";
import { MessageHandler } from "./providers/MessageHandler";
import { DatabaseAuthProvider } from "./providers/AuthProvider";
import { RateLimitService } from "./services/RateLimitService";
import { EventBus } from "./core/events/EventBus";
import { WhatsAppEventType, WhatsAppEvent } from "./core/events/WhatsAppEvents";
import {
  SendMessageOptions,
  MessagePayload,
  TemplateComponent,
  MediaPayload,
  SessionStatus,
} from "./core/types/whatsapp.types";
import { prisma } from "@/config/database";
import { TenantContextManager } from "@/config/tenantContext";
import { Logger } from "@/utils/logger";
import { WASocket } from "@whiskeysockets/baileys"; // 🛡️ Import for raw socket access

import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { AppError } from "@/utils/AppError";
// 🚧 BullMQ queue disabled - Redis allkeys-lru incompatible
// import { whatsappQueue } from "./queue/WhatsAppQueue";

export class WhatsAppService {
  private static instance: WhatsAppService;

  private authProvider: IAuthProvider;
  private sessionManager: ISessionManager;
  private messageHandler: IMessageHandler;
  private rateLimitService: RateLimitService;
  private eventBus: EventBus;
  private sessionRepository: WhatsAppSessionRepository;

  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.authProvider = new DatabaseAuthProvider();
    this.sessionManager = new SessionManager(this.authProvider);
    this.messageHandler = new MessageHandler(this.sessionManager);
    this.rateLimitService = new RateLimitService();
    this.sessionRepository = new WhatsAppSessionRepository();

    this.setupEventHandlers();
  }

  static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  private setupEventHandlers(): void {
    this.eventBus.subscribe("*", (event: WhatsAppEvent) => {
      Logger.info(`[WhatsAppService] Event: ${event.type}`, {
        sessionId: event.sessionId,
        companyId: event.companyId,
      });
    });

    this.eventBus.subscribe(
      WhatsAppEventType.SESSION_DISCONNECTED,
      async (event) => {
        const { sessionId, data } = event;

        // 🛡️ 100-YEAR FIX: If it's reconnecting, don't mark as DISCONNECTED in DB
        // This prevents the frontend from showing 'Disconnected' during a simple network blip
        if (data.isReconnecting) {
          Logger.info(
            `[WhatsAppService] Session blip, ignoring DISCONNECTED update (reconnecting...)`,
            { sessionId },
          );
          return;
        }

        // 🛡️ AGGRESSIVE RETRY LOGIC (Resilience Pattern)
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            await this.sessionRepository.update(sessionId, {
              status: "DISCONNECTED",
            });
            Logger.info(
              `[WhatsAppService] ✅ Session marked DISCONNECTED in DB`,
              { sessionId },
            );
            break;
          } catch (error: unknown) {
            attempts++;
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            Logger.warn(
              `[WhatsAppService] ⚠️ DB Status Sync Failed. Retrying...`,
              { error: errorMessage, sessionId, attempt: attempts },
            );

            if (attempts === maxAttempts) {
              Logger.error(
                `[WhatsAppService] ❌ Failed to update session status.`,
                { sessionId, error: errorMessage },
              );
            } else {
              await new Promise((resolve) =>
                setTimeout(resolve, attempts * 1000),
              );
            }
          }
        }
      },
    );

    this.eventBus.subscribe(
      WhatsAppEventType.SESSION_CONNECTED,
      async (event) => {
        try {
          await this.sessionRepository.update(event.sessionId, {
            status: "CONNECTED",
            phone: event.data.phone,
          });
          Logger.info(`[WhatsAppService] ✅ Session marked CONNECTED in DB`, {
            sessionId: event.sessionId,
          });
        } catch (error) {
          Logger.error(
            `[WhatsAppService] ❌ Failed to update session status to CONNECTED`,
            { sessionId: event.sessionId, error },
          );
        }
      },
    );

    this.eventBus.subscribe(
      WhatsAppEventType.RATE_LIMIT_EXCEEDED,
      async (event) => {
        Logger.warn(`[WhatsAppService] Rate limit exceeded`, {
          sessionId: event.sessionId,
          data: event.data,
        });
      },
    );
  }

  async initialize(): Promise<void> {
    Logger.info("[WhatsAppService] Initializing...");

    // 🛡️ SYSTEM MODE: Server startup needs access to all sessions
    // This bypasses tenant isolation since there's no active request context

    // 🧹 CLEANUP: Remove stale SCANNING sessions (user never completed QR scan)
    // These are "ghost" sessions that should not be restored.
    const deletedStale = await TenantContextManager.runAsSystem(() =>
      this.sessionRepository.deleteMany({
        status: "SCANNING",
        updatedAt: {
          lt: new Date(Date.now() - 10 * 60 * 1000),
        },
      }),
    );

    if (deletedStale.count > 0) {
      Logger.info(
        `[WhatsAppService] 🧹 Cleaned up ${deletedStale.count} stale SCANNING sessions`,
      );
    }

    // 🛡️ 100-YEAR FIX: Only restore sessions that were CONNECTED at some point.
    // Sessions in SCANNING state are incomplete and should NOT be auto-restored.
    const sessions = await TenantContextManager.runAsSystem(() =>
      this.sessionRepository.findByStatus(["CONNECTED", "DISCONNECTED"]),
    );

    Logger.info(
      `[WhatsAppService] Found ${sessions.length} active sessions to restore`,
    );

    for (const session of sessions) {
      try {
        await this.sessionManager.initializeSession({
          sessionId: session.sessionId,
          companyId: session.companyId,
          // authDir deprecated: DatabaseAuthProvider handles storage
        });
      } catch (error) {
        Logger.error(
          `[WhatsAppService] Failed to initialize session ${session.sessionId}`,
          { error, sessionId: session.sessionId },
        );
      }
    }

    Logger.info("[WhatsAppService] Initialization complete");
  }

  async createSession(
    companyId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; qrCode: string | null }> {
    Logger.info(`[WhatsAppService] createSession called for ${companyId}`);

    // 🔧 CRITICAL FIX: Clean up abandoned sessions before creating new one
    // This prevents QR generation for old sessions that were never completed
    const abandonedSessions = await TenantContextManager.runAsSystem(async () =>
      this.sessionRepository.findByStatus(
        ["CONNECTING", "SCANNING", "DISCONNECTED"],
        [companyId], // Filter by company
      ),
    );

    Logger.info(
      `[WhatsAppService] Found ${abandonedSessions.length} abandoned sessions for ${companyId}`,
    );

    for (const oldSession of abandonedSessions) {
      Logger.info(
        `[WhatsAppService] Cleaning up abandoned session: ${oldSession.sessionId}`,
      );
      try {
        await this.sessionManager.terminateSession(oldSession.sessionId);
        await TenantContextManager.runAsSystem(async () =>
          this.sessionRepository.delete(oldSession.sessionId),
        );
      } catch (err) {
        Logger.warn(
          `[WhatsAppService] Failed to cleanup ${oldSession.sessionId}: ${String(err)}`,
        );
      }
    }

    // Now create fresh session
    const finalSessionId = sessionId || `wa_${companyId}_${Date.now()}`;
    Logger.info(`[WhatsAppService] Creating NEW session ${finalSessionId}`);

    await this.sessionRepository.create({
      sessionId: finalSessionId,
      status: "DISCONNECTED",
      company: { connect: { id: companyId } },
    });

    // 🎯 ENTERPRISE PATTERN: Wait for QR code generation using EventBus
    // This ensures we don't return until QR is available or timeout occurs
    Logger.info(
      `[WhatsAppService] Setting up QR listener for ${finalSessionId}`,
    );
    const qrCodePromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        Logger.warn(
          `[WhatsAppService] QR timeout for ${finalSessionId} after 30s`,
        );
        this.eventBus.unsubscribe(WhatsAppEventType.SESSION_QR_CODE, handler);
        reject(new Error("QR code generation timeout (30s)"));
      }, 30000); // 30 second timeout

      const handler = (
        event: WhatsAppEvent<WhatsAppEventType.SESSION_QR_CODE>,
      ) => {
        if (event.sessionId === finalSessionId && event.data.qr) {
          Logger.info(
            `[WhatsAppService] QR received via EventBus for ${finalSessionId}`,
          );
          clearTimeout(timeout);
          this.eventBus.unsubscribe(WhatsAppEventType.SESSION_QR_CODE, handler);
          resolve(event.data.qr);
        }
      };

      this.eventBus.subscribe(WhatsAppEventType.SESSION_QR_CODE, handler);
      Logger.info(
        `[WhatsAppService] EventBus subscription active for ${finalSessionId}`,
      );
    });

    // Initialize session (this will trigger QR generation)
    Logger.info(`[WhatsAppService] Initializing socket for ${finalSessionId}`);
    await this.sessionManager.initializeSession({
      sessionId: finalSessionId,
      companyId,
      // authDir deprecated: DatabaseAuthProvider handles storage
    });
    Logger.info(`[WhatsAppService] Socket initialized for ${finalSessionId}`);

    // Wait for QR code or timeout
    try {
      const qrCode = await qrCodePromise;
      Logger.info(
        `[WhatsAppService] QR code generated successfully for ${finalSessionId}`,
      );
      return {
        sessionId: finalSessionId,
        qrCode,
      };
    } catch (error) {
      // If QR generation fails, return what we have
      // Session might be connecting without QR (already authenticated)
      Logger.warn(
        `[WhatsAppService] QR timeout/error for ${finalSessionId}, checking DB...`,
        { error },
      );

      const updatedSession =
        await this.sessionRepository.findOne(finalSessionId);

      Logger.info(
        `[WhatsAppService] DB check result - qrCode: ${updatedSession?.qrCode ? "EXISTS" : "NULL"}, status: ${updatedSession?.status}`,
      );

      return {
        sessionId: finalSessionId,
        qrCode: updatedSession?.qrCode || null,
      };
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionManager.terminateSession(sessionId);
    await this.authProvider.clearCredentials(sessionId);

    await this.sessionRepository.delete(sessionId);
  }

  /**
   * 🏗️ REFACTOR SUPPORT: New methods for Controller
   */

  async getSessions(companyId: string) {
    return this.sessionRepository.findByCompany(companyId);
  }

  async updateSessionQueue(
    companyId: string,
    sessionId: string,
    queueId: string | null,
  ) {
    // 1. Ownership Check
    const session = await this.sessionRepository.findOne(sessionId, companyId);
    if (!session) {
      throw new AppError("Session not found", 404);
    }

    // 2. Update via Repository
    if (queueId) {
      return this.sessionRepository.update(sessionId, {
        defaultQueue: { connect: { id: queueId } },
      });
    } else {
      return this.sessionRepository.update(sessionId, {
        defaultQueue: { disconnect: true },
      });
    }
  }

  async listSessions(companyId: string): Promise<SessionStatus[]> {
    return this.sessionManager.listSessions(companyId);
  }

  async getSession(sessionId: string): Promise<SessionStatus> {
    return this.sessionManager.getSessionStatus(sessionId);
  }

  /**
   * 🛡️ 100-YEAR FIX: Expose Raw Socket
   * Necessary for advanced operations like Group Metadata, Blocklist, etc.
   * that are not covered by the simplified Service interface.
   */
  getSocket(sessionId: string): WASocket | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  /**
   * 🚀 SEND MESSAGE (Direct Execution - 100-Year Fix)
   *
   * IMPORTANT: BullMQ queue was removed because Redis allkeys-lru eviction
   * policy causes jobs to be deleted before processing. For direct chat
   * interactions, synchronous execution is appropriate.
   *
   * For future bulk campaigns, use a dedicated Redis with noeviction policy.
   */
  async sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    // 1. Memory-First Session Lookup
    const activeSession = await this.sessionManager.findActiveSessionForCompany(
      options.companyId,
    );

    if (!activeSession) {
      throw new Error(
        `No active WhatsApp session for company: ${options.companyId}`,
      );
    }

    // 2. Rate Limit Check
    await this.rateLimitService.enforceLimit(activeSession.sessionId);

    // 3. Execute Send Directly (No Queue - Redis allkeys-lru incompatible)
    if (options.media) {
      return this.messageHandler.sendMedia(to, options.media, options);
    }
    return this.messageHandler.sendMessage(to, content, options);
  }

  /**
   * 🤖 WORKER INTERFACE: Execute the actual send (Bypassing Queue)
   */
  async executeQueuedMessage(
    sessionId: string,
    to: string,
    content: string,
    options: SendMessageOptions,
  ) {
    // 2. Enforce rate limits (Late Binding Check)
    await this.rateLimitService.enforceLimit(sessionId);

    // 3. Dispatch
    if (options.media) {
      return this.messageHandler.sendMedia(to, options.media, options);
    }
    return this.messageHandler.sendMessage(to, content, options);
  }

  /**
   * 🎭 WORKER INTERFACE: Simulate Human Typing
   */
  async simulateTyping(sessionId: string, to: string) {
    const sock = this.sessionManager.getSession(sessionId);
    if (sock) {
      // 🛡️ 100-YEAR FIX: Baileys requires full JID format
      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
      await sock.sendPresenceUpdate("composing", jid);
    }
  }

  /**
   * 📡 SEND PRESENCE (Typing/Recording)
   */
  async sendPresenceUpdate(
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ): Promise<void> {
    // 1. MEMORY-FIRST Validation
    const activeSession =
      await this.sessionManager.findActiveSessionForCompany(companyId);

    if (!activeSession) {
      // Fail silently for presence updates to avoid UI errors for trivial features
      return;
    }

    return this.messageHandler.sendPresenceUpdate(to, type, companyId);
  }

  /**
   * 🎨 SEND TEMPLATE (Enhanced with Media Header Support)
   * Supports HEADER components: TEXT, IMAGE, VIDEO, DOCUMENT
   * BODY text is hydrated with {{key}} params
   */
  async sendTemplate(
    to: string,
    templateId: string,
    params: Record<string, string>,
    options: SendMessageOptions,
  ): Promise<MessagePayload> {
    // 1. Fetch Template
    const template = await prisma.messageTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // 2. Parse Components (safely cast Json)
    const components = template.components as unknown as TemplateComponent[];

    // 3. Extract HEADER (if media type)
    const header = components.find((c) => c.type === "HEADER");
    let mediaPayload: MediaPayload | undefined;

    if (header && header.format && header.format !== "TEXT") {
      // HEADER is media type (IMAGE, VIDEO, DOCUMENT)
      const mediaUrl = header.url || (params["headerMediaUrl"] as string);

      if (mediaUrl) {
        const formatToType: Record<string, MediaPayload["type"]> = {
          IMAGE: "image",
          VIDEO: "video",
          DOCUMENT: "document",
        };

        mediaPayload = {
          type: formatToType[header.format] || "document",
          url: mediaUrl,
          mimetype: this.inferMimeType(header.format, mediaUrl),
          filename: header.filename || params["headerFilename"],
          caption: undefined, // Will be set from BODY
        };
      }
    }

    // 4. Extract BODY and hydrate with params
    let bodyText = components
      .filter((c) => c.type === "BODY")
      .map((c) => c.text || "")
      .join("\n");

    Object.entries(params).forEach(([key, value]) => {
      bodyText = bodyText.replace(new RegExp(`{{${key}}}`, "g"), value);
    });

    // 5. Dispatch: Media with caption OR text only
    if (mediaPayload) {
      // Set body as caption for media
      mediaPayload.caption = bodyText;
      return this.sendMessage(to, bodyText, {
        ...options,
        media: mediaPayload,
      });
    }

    // Text-only template
    return this.sendMessage(to, bodyText, options);
  }

  /**
   * 🔧 Infer MIME type from format and URL
   */
  private inferMimeType(format: string, url: string): string {
    const ext = url.split(".").pop()?.toLowerCase() || "";

    const mimeMap: Record<string, string> = {
      // Images
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      // Videos
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      // Documents
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };

    if (mimeMap[ext]) return mimeMap[ext];

    // Fallback based on format
    const formatDefaults: Record<string, string> = {
      IMAGE: "image/jpeg",
      VIDEO: "video/mp4",
      DOCUMENT: "application/octet-stream",
    };

    return formatDefaults[format] || "application/octet-stream";
  }

  async reconnectSession(sessionId: string): Promise<void> {
    // We delegate to session manager's reconnect logic
    await this.sessionManager.reconnectSession(sessionId);
  }

  async syncMessages(_companyId: string, _fromDate: Date): Promise<void> {
    throw new Error("Message sync not yet implemented in new architecture");
  }

  /**
   * 🚀 CHECK COMPANY CONNECTION (Memory-First)
   * Checks in-memory first for fast response, falls back to DB if needed.
   */
  async isCompanyConnected(companyId: string): Promise<boolean> {
    // 1. Memory-first check (instant)
    if (this.sessionManager.hasActiveSessionInMemory(companyId)) {
      return true;
    }

    // 2. Fallback to DB (cold start scenario)
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
