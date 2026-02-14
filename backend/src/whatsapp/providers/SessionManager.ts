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
import { ConnectionHealer } from "./ConnectionHealer";
import {
  createSessionLogger,
  sessionModuleLogger as logger,
} from "./SessionLogger";

import { prisma } from "@/config/database";
import TenantContextManager from "@/config/tenantContext";

// 🛡️ Memory Store for Contact Resolution (LID -> Phone)
const store = new SimpleInMemoryStore();

/**
 * 🏗️ SESSION MANAGER (Refactored for SRP)
 *
 * Responsibilities: Socket lifecycle (create, bind events, terminate)
 * Delegated: ConnectionHealer (reconnect, heartbeat, retry timers)
 * Delegated: SessionLogger (Baileys error interception)
 *
 * Target: < 500 lines ✅
 */
export class SessionManager implements ISessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private sessionMetadata: Map<
    string,
    { companyId: string; status: SessionStatus["status"] }
  > = new Map();
  private eventBus: EventBus;
  private healer: ConnectionHealer;

  constructor(private authProvider: IAuthProvider) {
    this.eventBus = EventBus.getInstance();
    this.healer = new ConnectionHealer();
  }

  // ────────────────────────────────────────────────
  // SESSION INFO & LOOKUP
  // ────────────────────────────────────────────────

  async getSessionInfo(sessionId: string): Promise<{
    companyId: string;
    status: SessionStatus["status"];
    phone?: string | null;
  } | null> {
    const meta = this.sessionMetadata.get(sessionId);
    const sock = this.sessions.get(sessionId);
    if (meta) {
      let phone: string | undefined;
      if (sock?.user?.id) {
        phone = sock.user.id.split(":")[0].split("@")[0];
      }
      return { ...meta, phone };
    }

    // DB Fallback (System Context)
    const session = await TenantContextManager.runAsSystem(async () =>
      prisma.whatsAppSession.findUnique({
        where: { sessionId },
        select: { companyId: true, status: true, phone: true },
      }),
    );

    if (session) {
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

  // ────────────────────────────────────────────────
  // CONTACT / LID RESOLUTION
  // ────────────────────────────────────────────────

  public getContactInfo(jid: string) {
    return store.contacts[jidNormalizedUser(jid)];
  }

  public findContactByLid(lid: string): { id: string } | undefined {
    const lidBase = lid.split("@")[0].split(":")[0];
    if (!lidBase || lidBase.length < 10) return undefined;

    // Fast cache lookup first
    const cachedPhone = store.getPhoneFromLid(lidBase);
    if (cachedPhone && !cachedPhone.includes(lidBase)) {
      logger.info(
        `[SessionManager] ⚡ Cache hit: LID ${lidBase} → ${cachedPhone}`,
      );
      return { id: cachedPhone };
    }

    const contacts = store.contacts;
    for (const jid in contacts) {
      const contact = contacts[jid];
      if (!contact.lid) continue;
      const storedLidBase = contact.lid.split("@")[0].split(":")[0];
      if (lidBase === storedLidBase) {
        logger.info(`[SessionManager] ✅ LID ${lidBase} → Phone ${jid}`);
        return contact;
      }
    }

    logger.warn(`[SessionManager] ⚠️ LID Resolution Failed: ${lidBase}`);
    return undefined;
  }

  public async resolveLidToPhone(
    sessionId: string,
    lid: string,
  ): Promise<string | null> {
    const sock = this.sessions.get(sessionId);
    if (!sock) return null;

    const fromStore = this.findContactByLid(lid);
    if (fromStore?.id) {
      return fromStore.id.split("@")[0].split(":")[0];
    }

    logger.warn(
      `[SessionManager] ⚠️ Could not resolve LID ${lid}. Waiting for history sync...`,
    );
    return null;
  }

  // ────────────────────────────────────────────────
  // SESSION LIFECYCLE
  // ────────────────────────────────────────────────

  async initializeSession(config: SessionConfig): Promise<WASocket> {
    const { sessionId, companyId } = config;

    // Cleanup existing session before re-init
    if (this.sessions.has(sessionId)) {
      logger.info(`[SessionManager] Cleaning up existing session ${sessionId}`);
      await this.terminateSession(sessionId, false);
    }

    this.healer.cancelReconnect(sessionId);
    logger.info(`[SessionManager] Initializing session: ${sessionId}`);
    this.sessionMetadata.set(sessionId, { companyId, status: "CONNECTING" });

    // Load auth state
    const { state, saveCreds } = await this.authProvider.loadState(sessionId);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(
      `[SessionManager] Using WA v${version.join(".")}, isLatest: ${isLatest}`,
    );

    // 🛡️ MEMORY OPTIMIZATION: syncFullHistory controlled via env var
    const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY !== "false";

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: createSessionLogger(sessionId) as unknown as ReturnType<
        typeof import("pino")
      >,
      browser: Browsers.ubuntu("Reply CRM"),
      generateHighQualityLinkPreview: true,
      syncFullHistory,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      getMessage: async (key) => {
        if (!key.id) return undefined;
        try {
          const msg = await TenantContextManager.runAsSystem(async () =>
            prisma.message.findFirst({
              where: { whatsappMessageId: key.id },
              select: { metadata: true },
            }),
          );
          return msg?.metadata ? (msg.metadata as proto.IMessage) : undefined;
        } catch {
          return undefined;
        }
      },
    });

    // Bind store & events
    store.bind(sock.ev);
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
    sock.ev.on("creds.update", saveCreds);

    // Connection state
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.eventBus.publish({
          type: WhatsAppEventType.SESSION_QR_CODE,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { qr },
        });

        await TenantContextManager.runAsSystem(async () =>
          prisma.whatsAppSession.upsert({
            where: { sessionId },
            update: { qrCode: qr, status: "SCANNING" },
            create: { sessionId, companyId, status: "SCANNING", qrCode: qr },
          }),
        ).catch((err) => logger.error(`[DB Error] Update QR: ${err.message}`));
      }

      if (connection === "open") {
        let phoneNumber: string | null = null;
        if (sock.user?.id) {
          phoneNumber = sock.user.id.split(":")[0].split("@")[0];
        }

        logger.info(
          `[SessionManager] Session ${sessionId} CONNECTED ✅ Phone: ${phoneNumber || "Unknown"}`,
        );
        this.sessionMetadata.set(sessionId, { companyId, status: "CONNECTED" });

        await TenantContextManager.runAsSystem(async () =>
          prisma.whatsAppSession.update({
            where: { sessionId },
            data: { qrCode: null, status: "CONNECTED", phone: phoneNumber },
          }),
        );

        this.eventBus.publish({
          type: WhatsAppEventType.SESSION_CONNECTED,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { phone: phoneNumber || undefined },
        });

        // ⚡ Delegate heartbeat to ConnectionHealer
        this.healer.startHeartbeat(sessionId, sock, () =>
          this.sessions.has(sessionId),
        );
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

        // Cleanup listeners
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.ev.removeAllListeners("messages.upsert");

        this.healer.stopHeartbeat(sessionId);

        if (resetConnection) {
          this.sessionMetadata.set(sessionId, {
            companyId,
            status: "DISCONNECTED",
          });
          // Delegate smart reconnect to ConnectionHealer
          this.healer.scheduleReconnect(sessionId, errorMsg, (sid) =>
            this.reconnectSession(sid),
          );
        } else {
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

    // Message listener
    sock.ev.on("messages.upsert", async (m) => {
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

    // Message status updates
    sock.ev.on("messages.update", async (updates) => {
      for (const update of updates) {
        if (!update.key?.id) continue;
        this.eventBus.publish({
          type: WhatsAppEventType.MESSAGE_UPDATE,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { messageId: update.key.id, update },
        });
      }
    });

    // Presence updates (typing)
    sock.ev.on("presence.update", (data) => {
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

    // Delegate timer cleanup to healer
    this.healer.cleanupSession(sessionId);

    const sock = this.sessions.get(sessionId);
    if (sock) {
      try {
        sock.end(new Error("Session Terminated"));
      } catch {
        // Ignore close errors
      }
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");
      this.sessions.delete(sessionId);
    }

    this.sessionMetadata.delete(sessionId);

    if (clearAuth) {
      await this.authProvider.clearCredentials(sessionId);
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
    if (!meta) {
      const session = await TenantContextManager.runAsSystem(async () =>
        prisma.whatsAppSession.findUnique({ where: { sessionId } }),
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
      authDir: "",
    });
  }

  getSessionStatus(sessionId: string): SessionStatus {
    const meta = this.sessionMetadata.get(sessionId);
    return { sessionId, status: meta?.status || "DISCONNECTED" };
  }

  listSessions(companyId: string): SessionStatus[] {
    const list: SessionStatus[] = [];
    this.sessionMetadata.forEach((meta, sessionId) => {
      if (meta.companyId === companyId) {
        list.push({ sessionId, status: meta.status });
      }
    });
    return list;
  }

  // ────────────────────────────────────────────────
  // MEMORY-FIRST LOOKUPS
  // ────────────────────────────────────────────────

  async findActiveSessionForCompany(
    companyId: string,
  ): Promise<{ sessionId: string; socket: WASocket } | null> {
    // Memory-first
    for (const [sessionId, socket] of this.sessions.entries()) {
      const meta = this.sessionMetadata.get(sessionId);
      if (meta?.companyId === companyId && meta.status === "CONNECTED") {
        return { sessionId, socket };
      }
    }

    // DB fallback
    const dbSession = await TenantContextManager.runAsSystem(async () =>
      prisma.whatsAppSession.findFirst({
        where: { companyId, status: "CONNECTED" },
      }),
    );

    if (dbSession) {
      const socket = this.sessions.get(dbSession.sessionId);
      if (socket) return { sessionId: dbSession.sessionId, socket };

      // Auto-heal zombie sessions
      if (!this.healer.hasReconnectPending(dbSession.sessionId)) {
        logger.warn(
          `[SessionManager] Zombie session detected: ${dbSession.sessionId}. Auto-reconnecting.`,
        );
        this.reconnectSession(dbSession.sessionId).catch((err) =>
          logger.error(`[SessionManager] Auto-reconnect failed: ${err}`),
        );
      }
    }

    return null;
  }

  hasActiveSessionInMemory(companyId: string): boolean {
    for (const [sessionId] of this.sessions.entries()) {
      const meta = this.sessionMetadata.get(sessionId);
      if (meta?.companyId === companyId && meta.status === "CONNECTED") {
        return true;
      }
    }
    return false;
  }

  getSessionStore(_sessionId: string): unknown {
    return {
      chats: store.chats,
      messages: store.messages,
      contacts: store.contacts,
    };
  }
}
