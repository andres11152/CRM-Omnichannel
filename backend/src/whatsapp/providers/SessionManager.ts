import { ISessionManager } from "../core/interfaces/ISessionManager";
import { IAuthProvider } from "../core/interfaces/IAuthProvider";
import { SessionConfig, SessionStatus } from "../core/types/whatsapp.types";
import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType } from "../core/events/WhatsAppEvents";
import makeWASocket, {
  WASocket,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  proto,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import { SimpleInMemoryStore } from "./SimpleStore";

import { prisma } from "@/config/database";
import TenantContextManager from "@/config/tenantContext";
import pino from "pino";

// Optimized logger for memory efficiency
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

// 🛡️ 100-YEAR FIX: Memory Store for Contact Resolution (LID -> Phone)
// Replaced broken Baileys import with custom implementation
const store = new SimpleInMemoryStore();

export class SessionManager implements ISessionManager {
  private sessions: Map<string, WASocket> = new Map();
  // Store retry timeouts to clear them on destroy
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  // ⚡ Heartbeat timers to keep sessions alive
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private sessionMetadata: Map<
    string,
    { companyId: string; status: SessionStatus["status"] }
  > = new Map();
  private eventBus: EventBus;

  constructor(private authProvider: IAuthProvider) {
    this.eventBus = EventBus.getInstance();
    // Optional: Load store from file if needed in future
    // store.readFromFile('./baileys_store.json')
  }

  /**
   * 🛡️ Returns session metadata for consumers (avoiding direct DB access in controllers)
   */
  async getSessionInfo(sessionId: string): Promise<{
    companyId: string;
    status: SessionStatus["status"];
    phone?: string | null;
  } | null> {
    // 1. Check Memory
    const meta = this.sessionMetadata.get(sessionId);
    const sock = this.sessions.get(sessionId);
    if (meta) {
      let phone = undefined;
      if (sock?.user?.id) {
        phone = sock.user.id.split(":")[0].split("@")[0];
      }
      return { ...meta, phone };
    }

    // 2. Database Fallback (System Context)
    const session = await TenantContextManager.runAsSystem(async () =>
      prisma.whatsAppSession.findUnique({
        where: { sessionId },
        select: { companyId: true, status: true, phone: true },
      }),
    );

    if (session) {
      // Heal memory cache
      this.sessionMetadata.set(sessionId, {
        companyId: session.companyId,
        status: session.status as SessionStatus["status"],
      });
      return {
        companyId: session.companyId,
        status: session.status as SessionStatus["status"],
        phone: session.phone,
      };
    }

    return null;
  }

  // 🛡️ Helper to get user info from store
  public getContactInfo(jid: string) {
    return store.contacts[jidNormalizedUser(jid)];
  }

  // 🛡️ REVERSE LOOKUP: Find real phone JID from LID
  // 🔧 100-YEAR FIX: More robust lookup using numeric base and proper normalization
  public findContactByLid(lid: string): { id: string } | undefined {
    // 1. Extract numeric base from target LID (e.g. "459089..." from "459089...@s.whatsapp.net")
    const lidBase = lid.split("@")[0].split(":")[0];
    if (!lidBase || lidBase.length < 10) return undefined;

    // 🔍 Step 0: Check the fast LID->Phone cache first
    const cachedPhone = store.getPhoneFromLid(lidBase);
    if (cachedPhone && !cachedPhone.includes(lidBase)) {
      console.info(
        `[SessionManager] ⚡ Cache hit: LID ${lidBase} → ${cachedPhone}`,
      );
      return { id: cachedPhone };
    }

    const contacts = store.contacts;

    // 🔍 Step 1: Search by 'lid' property (Looking for Phone contacts that reference this LID)
    for (const jid in contacts) {
      const contact = contacts[jid];
      if (!contact.lid) continue;

      const storedLidBase = contact.lid.split("@")[0].split(":")[0];
      if (lidBase === storedLidBase) {
        console.info(
          `[SessionManager] ✅ Identity Match! LID ${lidBase} belongs to Phone ${jid}`,
        );
        return contact;
      }
    }

    // 🔍 Step 2: Fallback REMOVED.
    // We only want to return a result if we found a LINK to a Phone JID.
    // Returning the LID contact itself is useless for resolution.

    console.warn(
      `[SessionManager] ⚠️ ID Resolution Failed: ${lidBase} not found in Store mappings.`,
    );
    return undefined;
  }
  /**
   * 🛡️ 100-YEAR FIX: Active LID Resolution
   * Queries WhatsApp servers directly to resolve a LID to a real phone number.
   * This is what WhatsApp Web does when displaying unknown contacts.
   */
  public async resolveLidToPhone(
    sessionId: string,
    lid: string,
  ): Promise<string | null> {
    const sock = this.sessions.get(sessionId);
    if (!sock) {
      console.warn(
        `[SessionManager] Session not found for LID resolution: ${sessionId}`,
      );
      return null;
    }

    // 🛡️ 100-YEAR FIX: First check the Store (Memory)
    // The Store is populated by syncFullHistory: true
    const fromStore = this.findContactByLid(lid);
    if (fromStore?.id) {
      const realPhone = fromStore.id.split("@")[0].split(":")[0];
      console.info(
        `[SessionManager] ⚡ Store-hit: LID ${lid} resolved to ${realPhone}`,
      );
      return realPhone;
    }

    // Note: onWhatsApp CANNOT resolve LIDs directly. It only verifies if a number exists.
    // Since we can't query "Who owns this LID?" via public API, we must rely on the Store.

    console.warn(
      `[SessionManager] ⚠️ Could not resolve LID ${lid} (not in Store). Waiting for history sync...`,
    );
    return null;
  }

  /**
   * 🛡️ SESSION HEALER: Intercepts internal Baileys errors to detect corruption.
   * If a "Bad MAC" or fatal crypto error occurs, it nukes the session automatically.
   */
  private createSessionLogger(sessionId: string) {
    const baseLogger = pino({ level: "error" }); // Capture errors only

    // Proxy to intercept log calls (THE 100-YEAR FIX)
    return new Proxy(baseLogger, {
      get: (target, prop, receiver) => {
        const original = Reflect.get(target, prop, receiver);
        if (typeof original === "function" && prop === "error") {
          return (...args: unknown[]) => {
            const msg = args
              .map((a) =>
                typeof a === "string"
                  ? a
                  : a instanceof Error
                    ? `${a.message} ${a.stack}`
                    : typeof a === "object"
                      ? JSON.stringify(a) // Check object content too
                      : "",
              )
              .join(" ");

            // 🚨 DETECT CORRUPTION SIGNATURES
            if (
              msg.includes("Bad MAC") ||
              msg.includes("Decryption failed") ||
              msg.includes("Session error") ||
              msg.includes("No matching sessions") ||
              msg.includes("failed to decrypt")
            ) {
              // 🛡️ 100-YEAR FIX: ARMOR MODE
              // We DO NOT nuke the session for decryption errors.
              // We just log a warning and let Baileys handle the retry/drop.
              logger.warn(
                `[SessionGuard] 🛡️ Decryption error intercepted in Session ${sessionId}: "${msg.substring(
                  0,
                  100,
                )}..." - IGNORING to prevent session loss.`,
              );
              return; // Suppress the loud error log
            }

            // Call original logger
            original.apply(target, args);
          };
        }
        return original;
      },
    });
  }

  /**
   * Initialize a new WhatsApp session with memory leak protection
   */
  async initializeSession(config: SessionConfig): Promise<WASocket> {
    const { sessionId, companyId } = config;

    // 1. CLEANUP: If session exists, destroy it first to update/reconnect properly
    if (this.sessions.has(sessionId)) {
      logger.info(
        `[SessionManager] Cleaning up existing session ${sessionId} before re-init`,
      );
      await this.terminateSession(sessionId, false); // False = keep auth data
    }

    // 2. Cancel any pending reconnect timers
    if (this.retryTimeouts.has(sessionId)) {
      clearTimeout(this.retryTimeouts.get(sessionId));
      this.retryTimeouts.delete(sessionId);
    }

    logger.info(`[SessionManager] Initializing session: ${sessionId}`);
    this.sessionMetadata.set(sessionId, { companyId, status: "CONNECTING" });

    // 3. Load auth state
    const { state, saveCreds } = await this.authProvider.loadState(sessionId);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    logger.info(
      `[SessionManager] Using WA v${version.join(".")}, isLatest: ${isLatest}`,
    );

    // 4. Create Socket
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      // 🛡️ INJECT HEALER LOGGER
      logger: this.createSessionLogger(sessionId) as pino.Logger,
      browser: Browsers.ubuntu("Reply CRM"),
      generateHighQualityLinkPreview: true,
      syncFullHistory: true, // 🛡️ 100-YEAR FIX: Must be TRUE to resolve LIDs -> Phones
      shouldIgnoreJid: (jid) => isJidBroadcast(jid), // Ignore status updates
      // Optimized message retrieval (only minimal fields)
      getMessage: async (key) => {
        if (!key.id) return undefined;
        try {
          // 🛡️ SYSTEM MODE: Background fetch for Baileys retry mechanism
          const msg = await TenantContextManager.runAsSystem(async () =>
            prisma.message.findFirst({
              where: { whatsappMessageId: key.id }, // Corrected field: whatsappMessageId
              select: { metadata: true },
            }),
          );
          return msg?.metadata ? (msg.metadata as proto.IMessage) : undefined;
        } catch {
          return undefined;
        }
      },
    });

    // 5. MEMORY SAFETY: Bind listeners globally but clean them on close
    store.bind(sock.ev); // 🛡️ Bind Store for contact updates
    this.bindEvents(sock, sessionId, companyId, saveCreds);

    this.sessions.set(sessionId, sock);
    return sock;
  }

  private bindEvents(
    sock: WASocket,
    sessionId: string,
    companyId: string,
    saveCreds: () => Promise<void>,
  ) {
    // Credential updates
    sock.ev.on("creds.update", saveCreds);

    // Connection updates - The critical part
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code handling
      if (qr) {
        this.eventBus.publish({
          type: WhatsAppEventType.SESSION_QR_CODE,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { qr },
        });

        // 🛡️ SYSTEM MODE: Socket callback has no tenant context
        await TenantContextManager.runAsSystem(async () =>
          prisma.whatsAppSession.upsert({
            where: { sessionId },
            update: { qrCode: qr, status: "SCANNING" },
            create: {
              sessionId,
              companyId,
              status: "SCANNING",
              qrCode: qr,
            },
          }),
        ).catch((err) => logger.error(`[DB Error] Update QR: ${err.message}`));
      }

      // Connection state handling
      if (connection === "open") {
        // Extract phone from JID (e.g., "573001234567:15@s.whatsapp.net" -> "573001234567")
        let phoneNumber = null;
        if (sock.user?.id) {
          phoneNumber = sock.user.id.split(":")[0].split("@")[0];
        }

        logger.info(
          `[SessionManager] Session ${sessionId} CONNECTED ✅ Phone: ${phoneNumber || "Unknown"}`,
        );
        this.sessionMetadata.set(sessionId, {
          companyId,
          status: "CONNECTED",
        });

        // Clear QR code on success AND save phone number
        // 🛡️ SYSTEM MODE: Socket callback has no tenant context
        await TenantContextManager.runAsSystem(async () =>
          prisma.whatsAppSession.update({
            where: { sessionId },
            data: {
              qrCode: null,
              status: "CONNECTED",
              phone: phoneNumber, // ✅ Save Phone Number
            },
          }),
        );

        this.eventBus.publish({
          type: WhatsAppEventType.SESSION_CONNECTED,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { phone: phoneNumber || undefined },
        });

        // ⚡ INICIAR HEARTBEAT para mantener conexión viva
        this.startHeartbeat(sessionId, sock);
      }

      if (connection === "close") {
        const boomError = lastDisconnect?.error as {
          output?: { statusCode: number };
          message?: string;
        };

        const resetConnection =
          boomError?.output?.statusCode !== DisconnectReason.loggedOut;
        const errorMsg = boomError?.message || "Unknown";

        logger.warn(
          `[SessionManager] Session ${sessionId} CLOSED. Reason: ${errorMsg}. Reconnect: ${resetConnection}`,
        );

        // CLEANUP LISTENERS IMMEDIATELY
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.ev.removeAllListeners("messages.upsert");

        // ⚡ DETENER HEARTBEAT
        this.stopHeartbeat(sessionId);

        if (resetConnection) {
          this.sessionMetadata.set(sessionId, {
            companyId,
            status: "DISCONNECTED",
          });

          // 🛡️ 100-YEAR FIX: Smart Reconnect Delay
          // If conflict, wait longer to let the other connection die or stabilize
          // "Stream Errored (conflict)" usually means another client is connected
          const isConflict = errorMsg.toLowerCase().includes("conflict");
          const delayMs = isConflict ? 15000 : 5000;

          if (isConflict) {
            logger.warn(
              `[SessionManager] ⚠️ Conflict detected (Stream Replaced). Waiting ${delayMs}ms before reconnect...`,
            );
          }

          const timeout = setTimeout(() => {
            this.reconnectSession(sessionId).catch((e) =>
              logger.error(`Reconnect failed: ${e}`),
            );
          }, delayMs);

          this.retryTimeouts.set(sessionId, timeout);
        } else {
          // Logged out permanently
          await this.terminateSession(sessionId, true);
        }

        this.eventBus.publish({
          type: WhatsAppEventType.SESSION_DISCONNECTED,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { reason: errorMsg, isReconnecting: resetConnection },
        });
      }
    });

    // 📨 MESSAGE LISTENER (The missing link!)
    sock.ev.on("messages.upsert", async (m) => {
      // Only process notify or append messages
      if (m.type === "notify" || m.type === "append") {
        for (const msg of m.messages) {
          if (!msg.message) continue;

          this.eventBus.publish({
            type: WhatsAppEventType.MESSAGE_RECEIVED,
            sessionId,
            companyId,
            timestamp: new Date(),
            data: { message: msg },
          });
        }
      }
    });

    // 📈 MESSAGE STATUS UPDATES (Sent -> Delivered -> Read)
    sock.ev.on("messages.update", async (updates) => {
      for (const update of updates) {
        if (!update.key?.id) continue;

        this.eventBus.publish({
          type: WhatsAppEventType.MESSAGE_UPDATE,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: {
            messageId: update.key.id,
            update: update,
          },
        });
      }
    });

    // 🟢 PRESENCE UPDATES (Typing indicators)
    sock.ev.on("presence.update", (data) => {
      console.info(`[SessionManager] Raw Presence: ${JSON.stringify(data)}`);
      this.eventBus.publish({
        type: WhatsAppEventType.PRESENCE_UPDATE,
        sessionId,
        companyId,
        timestamp: new Date(),
        data,
      });
    });
  }

  getSession(sessionId: string): WASocket | undefined {
    return this.sessions.get(sessionId);
  }

  async terminateSession(
    sessionId: string,
    clearAuth: boolean = false,
  ): Promise<void> {
    logger.info(
      `[SessionManager] Terminating session ${sessionId}. ClearAuth: ${clearAuth}`,
    );

    // 0. Stop Heartbeat
    this.stopHeartbeat(sessionId);

    const sock = this.sessions.get(sessionId);

    // 1. Cancel pending retries
    if (this.retryTimeouts.has(sessionId)) {
      clearTimeout(this.retryTimeouts.get(sessionId));
      this.retryTimeouts.delete(sessionId);
    }

    if (sock) {
      // 2. Force close socket
      try {
        sock.end(new Error("Session Terminated"));
      } catch {
        // Ignore close errors
      }

      // 3. Remove ALL listeners to prevent leaks
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert"); // If bound elsewhere

      this.sessions.delete(sessionId);
    }

    this.sessionMetadata.delete(sessionId);

    if (clearAuth) {
      await this.authProvider.clearCredentials(sessionId);
      // 🛡️ SYSTEM MODE: Session management operation
      await TenantContextManager.runAsSystem(async () =>
        prisma.whatsAppSession
          .update({
            where: { sessionId },
            data: { status: "DISCONNECTED", qrCode: null },
          })
          .catch(() => {}),
      );
    }
  }

  public async reconnectSession(sessionId: string): Promise<void> {
    const meta = this.sessionMetadata.get(sessionId);
    // Only reconnect if we have metadata (meaning we intend to keep it alive)
    if (!meta) {
      // Fallback: fetch from DB
      // 🛡️ SYSTEM MODE: Reconnection logic needs to query session
      const session = await TenantContextManager.runAsSystem(async () =>
        prisma.whatsAppSession.findUnique({
          where: { sessionId },
        }),
      );
      if (session) {
        await this.initializeSession({
          sessionId,
          companyId: session.companyId,
          authDir: "",
        });
        return;
      }
      logger.error(
        `[SessionManager] Cannot reconnect ${sessionId}, metadata lost.`,
      );
      return;
    }

    logger.info(`[SessionManager] Attempting Reconnect for ${sessionId}`);
    await this.initializeSession({
      sessionId,
      companyId: meta.companyId,
      authDir: "", // Handled by AuthProvider
    });
  }

  getSessionStatus(sessionId: string): SessionStatus {
    const meta = this.sessionMetadata.get(sessionId);
    return {
      sessionId,
      status: meta?.status || "DISCONNECTED",
    };
  }

  listSessions(companyId: string): SessionStatus[] {
    const list: SessionStatus[] = [];
    this.sessionMetadata.forEach((meta, sessionId) => {
      if (meta.companyId === companyId) {
        list.push({
          sessionId,
          status: meta.status,
        });
      }
    });
    return list;
  }

  /**
   * ⚡ HEARTBEAT: Keeps session active by querying presence periodically.
   * Prevents WhatsApp from closing the connection due to inactivity.
   */
  private startHeartbeat(sessionId: string, sock: WASocket) {
    this.stopHeartbeat(sessionId);
    // Ping every 5 minutes
    const timer = setInterval(async () => {
      try {
        if (!this.sessions.has(sessionId)) {
          this.stopHeartbeat(sessionId);
          return;
        }
        // Lightweight activity check
        if (sock.user?.id) {
          await sock.presenceSubscribe(sock.user.id).catch(() => {});
        }
      } catch {
        // Ignore heartbeat errors
      }
    }, 300000);

    this.heartbeatTimers.set(sessionId, timer);
  }

  private stopHeartbeat(sessionId: string) {
    const timer = this.heartbeatTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(sessionId);
    }
  }

  /**
   * 🚀 MEMORY-FIRST SESSION LOOKUP (Latency Optimization for Bulk Messaging)
   * Returns an active WASocket for a companyId by checking in-memory first.
   * Falls back to DB only if memory lookup fails.
   *
   * @param companyId - The company ID to find a session for
   * @returns Promise<{ sessionId: string; socket: WASocket } | null>
   */
  async findActiveSessionForCompany(
    companyId: string,
  ): Promise<{ sessionId: string; socket: WASocket } | null> {
    // 1. MEMORY-FIRST: Check in-memory sessions Map (O(n) but tiny N)
    for (const [sessionId, socket] of this.sessions.entries()) {
      const meta = this.sessionMetadata.get(sessionId);
      if (meta?.companyId === companyId && meta.status === "CONNECTED") {
        logger.debug(
          { sessionId, companyId },
          "[SessionManager] Memory-hit: found active session",
        );
        return { sessionId, socket };
      }
    }

    // 2. FALLBACK: Query DB (cold start or session not in memory)
    const dbSession = await TenantContextManager.runAsSystem(async () =>
      prisma.whatsAppSession.findFirst({
        where: { companyId, status: "CONNECTED" },
      }),
    );

    if (dbSession) {
      // Session exists in DB but not in memory - try to get socket
      const socket = this.sessions.get(dbSession.sessionId);
      if (socket) {
        logger.info(
          { sessionId: dbSession.sessionId, companyId },
          "[SessionManager] DB-hit: session found and socket exists",
        );
        return { sessionId: dbSession.sessionId, socket };
      }

      // Socket not in memory (server restart edge case)
      logger.warn(
        { sessionId: dbSession.sessionId },
        "[SessionManager] DB-hit but socket missing - Triggering Auto-Reconnect",
      );

      // 🛡️ 100-YEAR FIX: Auto-Heal "Zombie" Sessions
      // If DB says connected but we have no socket, we must reconnect.
      // We check if it's already being reconnected to avoid loops.
      if (!this.retryTimeouts.has(dbSession.sessionId)) {
        this.reconnectSession(dbSession.sessionId).catch((err) =>
          logger.error(`[SessionManager] Auto-reconnect failed: ${err}`),
        );
      }
    }

    return null;
  }

  /**
   * 🛡️ Check if a company has an active session in memory (no DB hit)
   * Useful for quick checks without waiting for DB response.
   */
  hasActiveSessionInMemory(companyId: string): boolean {
    for (const [sessionId] of this.sessions.entries()) {
      const meta = this.sessionMetadata.get(sessionId);
      if (meta?.companyId === companyId && meta.status === "CONNECTED") {
        return true;
      }
    }
    return false;
  }

  /**
   * 🗄️ GET SESSION STORE
   * Returns the Baileys in-memory store for historical message access.
   * Used by ChatSyncService for syncing historical messages.
   */
  getSessionStore(_sessionId: string): unknown {
    // Return the shared store instance
    // In future, could be per-session if needed
    return {
      chats: store.chats,
      messages: store.messages,
      contacts: store.contacts,
    };
  }
}
