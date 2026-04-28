/**
 * [BUILD] SESSION MANAGER (Refactored for SRP)
 *
 * Responsibilities: Socket lifecycle (create, terminate, reconnect)
 * Delegated: ConnectionHealer (reconnect, heartbeat, retry timers)
 * Delegated: SessionLogger (Baileys error interception)
 * Delegated: SessionEventBinder (Baileys event → EventBus wiring)
 */

import { ISessionManager } from "../core/interfaces/ISessionManager";
import { IAuthProvider } from "../core/interfaces/IAuthProvider";
import { SessionConfig, SessionStatus } from "../core/types/whatsapp.types";
import { EventBus } from "../core/events/EventBus";
import makeWASocket, {
  WASocket,
  Browsers,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  proto,
  jidNormalizedUser,
  Contact,
} from "@whiskeysockets/baileys";

interface ExtendedWASocket extends WASocket {
  getLidToPhoneNumberMap?: (lids: string[]) => Promise<{ [lid: string]: string }>;
}
import { SimpleInMemoryStore } from "./SimpleStore";
import { ConnectionHealer } from "./ConnectionHealer";
import {
  createSessionLogger,
  sessionModuleLogger as logger,
} from "./SessionLogger";
import NodeCache from "node-cache";

import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import TenantContextManager from "@/config/tenantContext";
import { bindSessionEvents } from "./events/SessionEventBinder";

export class SessionManager implements ISessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private sessionMetadata: Map<
    string,
    { companyId: string; status: SessionStatus["status"] }
  > = new Map();
  // [SEC] MEMORY STORES (Isolated per Session/Tenant)
  private sessionStores: Map<string, SimpleInMemoryStore> = new Map();
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
      whatsappSessionRepository.findSystemSession(sessionId),
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
  // CONTACT / LID RESOLUTION (Scoped to Session)
  // ────────────────────────────────────────────────

  public getContactInfo(sessionId: string, jid: string) {
    const store = this.sessionStores.get(sessionId);
    if (!store) return undefined;
    return store.contacts[jidNormalizedUser(jid)];
  }

  public findContactByLid(sessionId: string, lid: string): { id: string } | undefined {
    const store = this.sessionStores.get(sessionId);
    if (!store) return undefined;

    const lidBase = lid.split("@")[0].split(":")[0];
    if (!lidBase || lidBase.length < 10) return undefined;

    // Fast cache lookup first
    const cachedPhone = store.getPhoneFromLid(lidBase);
    if (cachedPhone && !cachedPhone.includes(lidBase)) {
      logger.info(
        `[SessionManager]  Cache hit: LID ${lidBase} → ${cachedPhone}`,
      );
      return { id: cachedPhone };
    }

    const contacts = store.contacts;
    for (const jid in contacts) {
      const contact = contacts[jid];
      if (!contact.lid) continue;
      const storedLidBase = contact.lid.split("@")[0].split(":")[0];
      if (lidBase === storedLidBase) {
        logger.info(`[SessionManager] [OK] LID ${lidBase} → Phone ${jid}`);
        return contact;
      }
    }

    logger.debug(`[SessionManager] [WARNING] LID Resolution Failed: ${lidBase}`);
    return undefined;
  }

  public async resolveLidToPhone(
    sessionId: string,
    lid: string,
  ): Promise<string | null> {
    const sock = this.sessions.get(sessionId) as ExtendedWASocket;
    if (!sock) return null;

    // [SEC] GUARD: Never attempt to resolve group JIDs or standard user JIDs as LIDs
    if (lid.includes("@g.us") || lid.includes("@s.whatsapp.net")) return null;

    // 1. Immediate Store Check (Strategy 1)
    const fromStore = this.findContactByLid(sessionId, lid);
    if (fromStore?.id && !fromStore.id.includes("@lid")) {
      return fromStore.id.split("@")[0].split(":")[0];
    }

    // 2. [SYNC] Single safe query to trigger LID resolution (avoid stream corruption)
    try {
      const fullLid = lid.includes("@lid") ? lid : `${lid}@lid`;
      // Only use onWhatsApp — profilePictureUrl/fetchStatus/MEX cause xml-not-well-formed
      sock.onWhatsApp(fullLid).catch(() => {});
    } catch {
      // Ignore trigger errors
    }

    // 3. [SYNC] POLL STORE — reduced iterations to avoid session overload
    for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const resolved = this.findContactByLid(sessionId, lid);
        if (resolved?.id && !resolved.id.includes("@lid")) {
            return resolved.id.split("@")[0].split(":")[0];
        }
    }

    return null;
  }

  public async resolveLidsToPhones(
    sessionId: string,
    lids: string[],
  ): Promise<Record<string, string>> {
     const results: Record<string, string> = {};
     // Run in parallel for efficiency
     await Promise.all(lids.map(async (lid) => {
        const phone = await this.resolveLidToPhone(sessionId, lid);
        if (phone) results[lid] = phone;
     }));
     return results;
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

    // [SEC] CREATE ISOLATED STORE FOR THIS SESSION
    const sessionStore = new SimpleInMemoryStore();
    this.sessionStores.set(sessionId, sessionStore);

    // Enable Redis persistence scoped to this session
    await sessionStore.enablePersistence(`${companyId}_${sessionId}`).catch((e) =>
      logger.error({ err: e }, `[SessionManager] Failed to enable persistence for ${sessionId}`)
    );

    // Load auth state
    const { state, saveCreds } = await this.authProvider.loadState(sessionId);

    // [SEC] RESILIENCE FIX: fetchLatestBaileysVersion makes an external HTTP call.
    // If the network is slow or restricted, it hangs indefinitely causing a 30s server timeout.
    // We race against a 5s timeout and fall back to a known-stable WA version.
    const FALLBACK_WA_VERSION: [number, number, number] = [2, 3000, 1023480872];
    let version: [number, number, number] = FALLBACK_WA_VERSION;
    let isLatest = false;
    try {
      const versionResult = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout")),
            5000,
          ),
        ),
      ]);
      version = versionResult.version as [number, number, number];
      isLatest = versionResult.isLatest;
    } catch (vErr) {
      logger.warn(
        `[SessionManager] [WARNING] Could not fetch latest WA version (${(vErr as Error).message}). Using fallback: ${FALLBACK_WA_VERSION.join(".")}`,
      );
    }
    logger.info(
      `[SessionManager] Using WA v${version.join(".")}, isLatest: ${isLatest}`,
    );

    // [SEC] MEMORY OPTIMIZATION: Default to false unless explicitly enabled
    const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY === "true";

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      // Intercept Baileys internal logs to detect corruption
      logger: createSessionLogger(sessionId, (sid) => {
        this.reconnectSession(sid).catch((e) => {
          logger.error(`[SessionGuard] Auto-healing reconnect failed: ${e}`);
        });
      }) as ReturnType<
        typeof import("pino")
      >,
      browser: Browsers.ubuntu("Reply CRM"),
      generateHighQualityLinkPreview: true,
      syncFullHistory,
      msgRetryCounterCache: new NodeCache(),
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      // [FIX] CRITICAL: Disable init queries that block the event buffer.
      // When executeInitQueries times out (which happens consistently),
      // Baileys' internal event buffer NEVER flushes, causing messages.upsert
      // to never fire. This was the ROOT CAUSE of messages not arriving.
      fireInitQueries: false,
      // [FIX] HISTORY SYNC: Accept history sync messages from WhatsApp
      // so that the store is populated with historical messages during
      // QR pairing. We conditionally accept based on sync type:
      // - INITIAL_BOOTSTRAP (2) and RECENT (0) are always accepted
      // - FULL (3) and PUSH_NAME (1) are accepted when syncFullHistory is enabled
      // Previously this returned `false` which silently rejected ALL history,
      // making on-demand sync impossible (store was always empty).
      shouldSyncHistoryMessage: (msg) => {
        if (syncFullHistory) return true;
        // Accept recent history types only (types 0=RECENT, 2=INITIAL_BOOTSTRAP)
        const syncType = msg.syncType;
        return syncType === 0 || syncType === 2;
      },
      getMessage: async (key) => {
        if (!key.id) return undefined;
        try {
          // Check session-specific store first
          if (key.remoteJid && sessionStore.messages[key.remoteJid]) {
            const msgArray = sessionStore.messages[key.remoteJid];
            const found = msgArray.find(
              (m) => (m as proto.IWebMessageInfo)?.key?.id === key.id,
            );
            if (found) return (found as proto.IWebMessageInfo).message as proto.IMessage;
          }

          // Fallback to database if not in memory
          const msg = await TenantContextManager.runAsSystem(async () =>
            messageRepository.findFirst({
              where: { whatsappMessageId: key.id },
              select: { metadata: true },
            }),
          );
          return msg?.metadata ? (msg.metadata as proto.IMessage) : undefined;
        } catch (err) {
          logger.error(
            `[SessionManager] getMessage error for ${key.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return undefined;
        }
      },
    });

    // Bind events (delegated to SessionEventBinder — store.bind is called inside)
    // [FIX] Removed duplicate sessionStore.bind(sock.ev) that was here.
    // SessionEventBinder.bindSessionEvents already calls store.bind(sock.ev) on line 74.
    bindSessionEvents(sock, sessionId, companyId, saveCreds, {
      eventBus: this.eventBus,
      healer: this.healer,
      store: sessionStore, // Pass isolated store
      sessions: this.sessions,
      sessionMetadata: this.sessionMetadata,
      terminateSession: (sid, clear) => this.terminateSession(sid, clear),
      reconnectSession: (sid) => this.reconnectSession(sid),
    });

    this.sessions.set(sessionId, sock);
    return sock;
  }

  getSession(sessionId: string): WASocket | undefined {
    return this.sessions.get(sessionId);
  }

  async terminateSession(
    sessionId: string,
    clearAuth: boolean = false,
  ): Promise<void> {
    logger.info(`[SessionManager] Terminating session ${sessionId}. Clear: ${clearAuth}`);

    // Delegate timer cleanup to healer
    this.healer.cleanupSession(sessionId);

    // [SEC] STORE LIFECYCLE: Only destroy on hard logout, preserve on reconnect
    const store = this.sessionStores.get(sessionId);
    if (store) {
      if (clearAuth) {
        // Hard termination (logout): wipe everything
        store.flush();
        this.sessionStores.delete(sessionId);
      } else {
        // Soft reconnect: persist current store to Redis before socket teardown
        // so history is preserved across reconnections
        const meta = this.sessionMetadata.get(sessionId);
        if (meta?.companyId) {
          await store.writeToRedis(`${meta.companyId}_${sessionId}`).catch(() => {});
        }
      }
    }

    const sock = this.sessions.get(sessionId);
    if (sock) {
      // 1. Immediately kill listeners to prevent "zombie" scheduled reconnections
      // when the socket drops.
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");

      try {
        if (clearAuth) {
          // Log out from WhatsApp completely so keys are universally flushed
          await sock.logout();
        } else {
          sock.end(undefined);
        }
      } catch {
        // Ignore close errors
      }
      this.sessions.delete(sessionId);
    }

    if (clearAuth) {
      this.sessionMetadata.delete(sessionId);
    } else {
      const meta = this.sessionMetadata.get(sessionId);
      if (meta) {
        meta.status = "DISCONNECTED";
      }
    }

    if (clearAuth) {
      await this.authProvider.clearCredentials(sessionId);
      await TenantContextManager.runAsSystem(async () =>
        whatsappSessionRepository
          .updateSystemSession(sessionId, {
            status: "DISCONNECTED",
            qrCode: null,
          })
          .catch(() => {}),
      );
    }
  }

  public async reconnectSession(sessionId: string): Promise<void> {
    const meta = this.sessionMetadata.get(sessionId);
    if (!meta) {
      const session = await TenantContextManager.runAsSystem(async () =>
        whatsappSessionRepository.findSystemSession(sessionId),
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
    const connectedSessions = await TenantContextManager.runAsSystem(async () =>
      whatsappSessionRepository.findByStatus("CONNECTED", [companyId]),
    );
    const dbSession = connectedSessions[0] || null;

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

  getSessionStore(sessionId: string): {
    chats: Map<string, import("@whiskeysockets/baileys").Chat>;
    messages: Record<string, import("@whiskeysockets/baileys").proto.IWebMessageInfo[]>;
    contacts: Record<string, Contact>;
    lidToPhone: Record<string, string>;
  } | null {
    const store = this.sessionStores.get(sessionId);
    if (!store) return null;
    return {
      chats: store.chats,
      messages: store.messages,
      contacts: store.contacts,
      lidToPhone: store.lidToPhone,
    };
  }

  // ────────────────────────────────────────────────
  // MEMORY MANAGEMENT
  // ────────────────────────────────────────────────

  public flushAllMemoryStores(): void {
    let count = 0;
    for (const [sessionId, store] of this.sessionStores.entries()) {
      store.flush();
      count++;
    }
    logger.warn(`[SessionManager] [MEM_MONITOR] Flushed memory stores for ${count} sessions to free RAM.`);
  }
}
