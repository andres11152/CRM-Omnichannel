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
import { WhatsAppEventType } from "../core/events/WhatsAppEvents";
import { WASocket, Contact } from "@whiskeysockets/baileys";

interface ExtendedWASocket extends WASocket {
  getLidToPhoneNumberMap?: (lids: string[]) => Promise<{ [lid: string]: string }>;
}
import { SimpleInMemoryStore } from "./SimpleStore";
import { ConnectionHealer } from "./ConnectionHealer";
import {
  cleanupSessionLogger,
  sessionModuleLogger as logger,
} from "./SessionLogger";

import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import TenantContextManager from "@/config/tenantContext";
// [OLD] Local Baileys socket creation — dead in production (Baileys connection
// lifecycle now lives entirely in the whatsapp-service microservice). Only
// referenced by initializeSession()/reconnectSession() below, which have no
// live callers anymore; kept for reference, see providers/old/.
import { bindSessionEvents } from "./old/SessionEventBinder";
import { SessionContactResolver } from "./SessionContactResolver";
import { container } from "@/config/container";
import { WA_TOKENS } from "../di/tokens";
import { WhatsAppSocketFactory } from "./old/WhatsAppSocketFactory";
import { antiBanManager } from "../services/AntiBanManager";

export class SessionManager implements ISessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private sessionMetadata: Map<
    string,
    { companyId: string; status: SessionStatus["status"]; isPairing?: boolean }
  > = new Map();
  // [SEC] MEMORY STORES (Isolated per Session/Tenant)
  private sessionStores: Map<string, SimpleInMemoryStore> = new Map();
  private eventBus: EventBus;
  private healer: ConnectionHealer;
  private contactResolver: SessionContactResolver;

  constructor(private authProvider: IAuthProvider) {
    this.eventBus = EventBus.getInstance();
    this.healer = new ConnectionHealer();
    // Pass sessionMetadata so SessionContactResolver can use the composite
    // (companyId::sessionId) store key and prevent cross-tenant store collisions.
    this.contactResolver = new SessionContactResolver(this.sessions, this.sessionStores, this.sessionMetadata);
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
    return this.contactResolver.getContactInfo(sessionId, jid);
  }

  public findContactByLid(sessionId: string, lid: string) {
    return this.contactResolver.findContactByLid(sessionId, lid);
  }

  public async resolveLidToPhone(
    sessionId: string,
    lid: string,
  ): Promise<string | null> {
    return this.contactResolver.resolveLidToPhone(sessionId, lid);
  }

  public async resolveLidsToPhones(
    sessionId: string,
    lids: string[],
  ): Promise<Record<string, string>> {
     return this.contactResolver.resolveLidsToPhones(sessionId, lids);
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

    // [SEC] C3 GUARD: Prevent the same sessionId from being reused by a different company.
    // If two tenants share a sessionId string, their in-memory stores would collide and
    // data would leak across tenant boundaries.
    const existingMeta = this.sessionMetadata.get(sessionId);
    if (existingMeta && existingMeta.companyId !== companyId) {
      throw new Error(
        `[SessionManager] SECURITY: sessionId "${sessionId}" is already registered for company ` +
        `"${existingMeta.companyId}" and cannot be reused by company "${companyId}". ` +
        `Use a unique sessionId per company.`,
      );
    }

    this.healer.cancelReconnect(sessionId);
    logger.info(`[SessionManager] Initializing session: ${sessionId}`);
    this.sessionMetadata.set(sessionId, {
      companyId,
      status: "CONNECTING",
      isPairing: !!config.phoneForPairing,
    });

    // [SEC] CREATE ISOLATED STORE FOR THIS SESSION (composite key: companyId::sessionId)
    // Using a composite key prevents store collisions when two companies accidentally
    // use the same sessionId string value.
    const sessionStore = new SimpleInMemoryStore();
    const storeKey = `${companyId}::${sessionId}`;
    this.sessionStores.set(storeKey, sessionStore);

    // Enable Redis persistence scoped to this session.
    // Redis key uses underscore separator (wa:store:companyId_sessionId) for legacy compatibility.
    await sessionStore.enablePersistence(`${companyId}_${sessionId}`).catch((e) =>
      logger.error({ err: e }, `[SessionManager] Failed to enable persistence for ${sessionId}`)
    );

    // Load auth state
    const { state, saveCreds } = await this.authProvider.loadState(sessionId);

    // Fetch session details from DB to read the proxyUrl if configured
    const dbSession = await TenantContextManager.runAsSystem(async () =>
      whatsappSessionRepository.findSystemSession(sessionId),
    );

    if (!dbSession) {
      logger.warn(
        `[SessionManager] Session ${sessionId} was deleted from DB during initialization. Aborting socket creation.`
      );
      const storeKey = `${companyId}::${sessionId}`;
      this.sessionStores.delete(storeKey);
      this.sessionMetadata.delete(sessionId);
      throw new Error(`Session ${sessionId} does not exist in database.`);
    }

    const rawSock = await WhatsAppSocketFactory.createSocket({
      sessionId,
      companyId,
      state,
      sessionStore,
      proxyUrl: dbSession?.proxyUrl,
      onLoggerError: (sid) => {
        this.reconnectSession(sid).catch((e) => {
          logger.error(`[SessionGuard] Auto-healing reconnect failed: ${e}`);
        });
      },
    });

    // Wrap with baileys-antiban: rate limiting, warmup, group op guard,
    // legitimacy signals, deaf-session detection, and more.
    // The wrapped socket is a drop-in replacement — all existing sendMessage calls
    // automatically go through anti-ban protection with no code changes required.
    const sock = await antiBanManager.initSession(sessionId, rawSock);

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

    if (config.phoneForPairing && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const cleanPhone = config.phoneForPairing!.replace(/\D/g, "");
          logger.info(`[SessionManager] Requesting pairing code for session ${sessionId} with phone ${cleanPhone}`);
          const code = await sock.requestPairingCode(cleanPhone);
          logger.info(`[SessionManager] Pairing code generated successfully for ${sessionId}: ${code}`);
          this.eventBus.publish({
            type: WhatsAppEventType.SESSION_PAIRING_CODE,
            sessionId,
            companyId,
            timestamp: new Date(),
            data: { code },
          });
        } catch (err) {
          logger.error({ err }, `[SessionManager] Failed to request pairing code for session ${sessionId}`);
        }
      }, 1000);
    }

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

    // Stop entropy service, persist warmup state, clean up antiban registry
    await antiBanManager.terminateSession(sessionId, true);

    // Delegate timer cleanup to healer
    this.healer.cleanupSession(sessionId);
    // [FIX] Clean corruption tracker state to prevent memory leaks
    cleanupSessionLogger(sessionId);

    // [SEC] STORE LIFECYCLE: Clear intervals and clean up references to prevent timer/memory leaks.
    // Use composite key (companyId::sessionId) to find the correct tenant-isolated store.
    const meta = this.sessionMetadata.get(sessionId);
    const storeKey = meta ? `${meta.companyId}::${sessionId}` : sessionId;
    const store = this.sessionStores.get(storeKey) ?? this.sessionStores.get(sessionId);
    const resolvedStoreKey = this.sessionStores.has(storeKey) ? storeKey : sessionId;

    if (store) {
      // ALWAYS disable persistence (clear the setInterval timer) before dereferencing
      store.disablePersistence();

      if (clearAuth) {
        // Hard termination (logout): wipe everything
        store.flush();
        this.sessionStores.delete(resolvedStoreKey);
      } else {
        // Soft reconnect: persist current store to Redis before socket teardown
        // so history is preserved across reconnections, then clear reference
        if (meta?.companyId) {
          await store.writeToRedis(`${meta.companyId}_${sessionId}`).catch(() => {});
        }
        this.sessionStores.delete(resolvedStoreKey);
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
            phone: null,
          })
          .catch(() => {}),
      );
    } else {
      await TenantContextManager.runAsSystem(async () =>
        whatsappSessionRepository
          .updateSystemSession(sessionId, {
            status: "DISCONNECTED",
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

  getMetaVirtualSocket(sessionId: string): WASocket {
    const metaProvider = container.resolve(WA_TOKENS.MetaProvider);
    return {
      sendMessage: async (jid: string, content: { text?: string }, options?: { messageId?: string }) => {
        const textContent = content?.text || "";
        const res = (await metaProvider.sendMessage(sessionId, jid, textContent, options)) as { messages?: Array<{ id: string }> };
        return {
          key: {
            id: res?.messages?.[0]?.id || options?.messageId || "meta_" + Date.now(),
            remoteJid: jid,
            fromMe: true
          },
          messageTimestamp: Math.floor(Date.now() / 1000)
        };
      },
      sendPresenceUpdate: async (type: string, toJid: string) => {
        // Meta Cloud API doesn't support typing indicator. No-op.
      },
      groupMetadata: async (groupJid: string) => {
        return null;
      }
    } as unknown as WASocket;
  }

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
      if (dbSession.provider === "META") {
        return {
          sessionId: dbSession.sessionId,
          socket: this.getMetaVirtualSocket(dbSession.sessionId),
        };
      }

      const socket = this.sessions.get(dbSession.sessionId);
      if (socket) return { sessionId: dbSession.sessionId, socket };

      // [SEC] Baileys connection lifecycle now lives entirely in the
      // whatsapp-service microservice. This backend process must NEVER open
      // its own Baileys socket for a BAILEYS-provider session — doing so
      // would race the microservice's live connection for the same session
      // and trigger `conflict: replaced` kicks. Previously this branch called
      // `this.reconnectSession(...)`, which did exactly that every time an
      // agent sent a reaction, read receipt, or typing indicator for a
      // company with no locally-cached socket (i.e. always, post-migration).
      logger.info(
        `[SessionManager] No local socket for ${dbSession.sessionId} (owned by whatsapp-service); not reconnecting locally.`,
      );
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
    // Try composite key first (companyId::sessionId), fall back to plain sessionId
    const meta = this.sessionMetadata.get(sessionId);
    const storeKey = meta ? `${meta.companyId}::${sessionId}` : sessionId;
    const store = this.sessionStores.get(storeKey) ?? this.sessionStores.get(sessionId);
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
    logger.warn(`[SessionManager] Flushed memory stores for ${count} sessions to free RAM.`);
  }

  public getAllMemorySessions(): Record<string, string> {
    const res: Record<string, string> = {};
    this.sessionMetadata.forEach((meta, sessionId) => {
      res[sessionId] = meta.status;
    });
    return res;
  }
}
