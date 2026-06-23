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
  cleanupSessionLogger,
  sessionModuleLogger as logger,
} from "./SessionLogger";
import NodeCache from "node-cache";

import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import TenantContextManager from "@/config/tenantContext";
import { bindSessionEvents } from "./events/SessionEventBinder";
import { getProxyAgent } from "@/utils/proxy";
import { SessionContactResolver } from "./SessionContactResolver";

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
        `[SessionManager] Could not fetch latest WA version (${(vErr as Error).message}). Using fallback: ${FALLBACK_WA_VERSION.join(".")}`,
      );
    }
    logger.info(
      `[SessionManager] Using WA v${version.join(".")}, isLatest: ${isLatest}`,
    );

    // [HISTORY] OPT-IN ONLY. Enabling this makes the phone push the ENTIRE chat history
    // (hundreds of chats × thousands of messages) via repeated messaging-history.set bursts.
    // On this deployment that floods the Prisma pool and Postgres starts closing connections
    // (scheduler/credential upserts fail). So default OFF; only recent history syncs on link.
    // Set WA_SYNC_FULL_HISTORY=true ONLY if the DB (connection_limit) can absorb the burst.
    const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY === "true";

    // Fetch session details from DB to read the proxyUrl if configured
    const dbSession = await TenantContextManager.runAsSystem(async () =>
      whatsappSessionRepository.findSystemSession(sessionId),
    );

    if (!dbSession) {
      logger.warn(
        `[SessionManager] Session ${sessionId} was deleted from DB during initialization. Aborting socket creation.`
      );
      this.sessionStores.delete(sessionId);
      this.sessionMetadata.delete(sessionId);
      throw new Error(`Session ${sessionId} does not exist in database.`);
    }
    
    // [SEC] PROXY LIFE-CYCLE: Generate Sticky Session Proxy and apply strict Kill Switch
    const { getEnv } = await import("@/config/env");
    const env = getEnv();
    const resolvedProxyUrl = dbSession?.proxyUrl || env.GLOBAL_PROXY_URL;

    let proxyAgent: import("https").Agent | undefined;
    if (resolvedProxyUrl) {
      const agent = getProxyAgent(resolvedProxyUrl, sessionId);
      if (!agent) {
        throw new Error(`[Proxy] CRITICAL: Proxy URL was configured (${resolvedProxyUrl}) but agent could not be created. Aborting socket connection to prevent real IP exposure.`);
      }
      proxyAgent = agent as unknown as import("https").Agent;
    }

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      agent: proxyAgent,
      fetchAgent: proxyAgent,
      // Intercept Baileys internal logs to detect corruption
      logger: createSessionLogger(sessionId, (sid) => {
        this.reconnectSession(sid).catch((e) => {
          logger.error(`[SessionGuard] Auto-healing reconnect failed: ${e}`);
        });
      }) as ReturnType<
        typeof import("pino")
      >,
      // [SEC] FINGERPRINTING: Emulate a clean Windows/Chrome environment instead of leaking custom agent names
      browser: ["Windows", "Chrome", "122.0.0.0"],
      // [SEC] NETWORK FOOTPRINT: Inject browser headers for handshake and media transfers
      options: {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      },
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
        // ALWAYS accept history sync messages. We already limit chat history depth
        // and deduplicate messages dynamically, so filtering them out at the socket level
        // is unnecessary and breaks manual/on-demand history synchronization.
        return true;
      },
      getMessage: async (key) => {
        // [DOCS] Baileys requires getMessage to return the ORIGINAL message CONTENT
        // (proto.IMessage) so it can decrypt poll votes, retry sends and serve on-demand
        // history. We only have the raw proto in the in-memory store (messages[jid]).
        // The DB only stores our parsed CRM content/metadata — that is NOT a proto.IMessage,
        // so returning it (as before) fed Baileys corrupt data. If the raw proto isn't in
        // the store, return undefined so Baileys falls back to a placeholder resend request.
        if (!key.id || !key.remoteJid) return undefined;
        try {
          const candidates = [
            sessionStore.messages[key.remoteJid],
            // LID/PN duality: the same chat may be keyed by the alternate JID in the store.
            ...Object.values(sessionStore.messages),
          ];
          for (const arr of candidates) {
            if (!arr) continue;
            const found = arr.find(
              (m) => (m as proto.IWebMessageInfo)?.key?.id === key.id,
            );
            if (found?.message) return (found as proto.IWebMessageInfo).message as proto.IMessage;
          }
          return undefined;
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
