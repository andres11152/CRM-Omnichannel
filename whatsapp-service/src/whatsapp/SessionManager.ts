import { ISessionManager } from "./interfaces";
import { IAuthProvider } from "./interfaces";
import { SessionConfig, SessionStatus } from "./types";
import { EventBus } from "./events/EventBus";
import { WhatsAppEventType } from "./events/WhatsAppEvents";
import { WASocket, Contact } from "@whiskeysockets/baileys";
import { SimpleInMemoryStore } from "./SimpleStore";
import { ConnectionHealer } from "./ConnectionHealer";
import {
  cleanupSessionLogger,
  sessionModuleLogger as logger,
} from "./SessionLogger";
import { prisma } from "../config/database";
import { whatsAppSessionRepository } from "../repositories/WhatsAppSessionRepository";
import { bindSessionEvents } from "./events/SessionEventBinder";
import { SessionContactResolver } from "./SessionContactResolver";
import { WhatsAppSocketFactory } from "./WhatsAppSocketFactory";
import { antiBanManager } from "./AntiBanManager";
import { sessionLockService } from "./SessionLockService";

export class SessionManager implements ISessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private sessionMetadata: Map<
    string,
    { companyId: string; status: SessionStatus["status"]; isPairing?: boolean }
  > = new Map();
  private sessionStores: Map<string, SimpleInMemoryStore> = new Map();
  private eventBus: EventBus;
  private healer: ConnectionHealer;
  private contactResolver: SessionContactResolver;

  constructor(private authProvider: IAuthProvider) {
    this.eventBus = EventBus.getInstance();
    this.healer = new ConnectionHealer();
    this.contactResolver = new SessionContactResolver(this.sessions, this.sessionStores, this.sessionMetadata);
  }

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

    const session = await prisma.whatsAppSession.findUnique({
      where: { sessionId },
    });

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

  async initializeSession(config: SessionConfig): Promise<WASocket> {
    const { sessionId, companyId } = config;

    if (this.sessions.has(sessionId)) {
      logger.info(`[SessionManager] Cleaning up existing session ${sessionId}`);
      await this.terminateSession(sessionId, false);
    }

    const existingMeta = this.sessionMetadata.get(sessionId);
    if (existingMeta && existingMeta.companyId !== companyId) {
      throw new Error(
        `[SessionManager] SECURITY: sessionId "${sessionId}" is already registered for company ` +
        `"${existingMeta.companyId}" and cannot be reused by company "${companyId}".`
      );
    }

    const acquiredLock = await sessionLockService.acquire(sessionId);
    if (!acquiredLock) {
      const owner = await sessionLockService.getOwner(sessionId);
      logger.warn(
        `[SessionManager] Refusing to initialize ${sessionId}: lock held by another instance (${owner}).`
      );
      throw new Error(`SESSION_OWNED_ELSEWHERE: ${sessionId} is active on instance ${owner}`);
    }

    this.healer.cancelReconnect(sessionId);
    logger.info(`[SessionManager] Initializing session: ${sessionId}`);
    this.sessionMetadata.set(sessionId, {
      companyId,
      status: "CONNECTING",
      isPairing: !!config.phoneForPairing,
    });

    const sessionStore = new SimpleInMemoryStore();
    const storeKey = `${companyId}::${sessionId}`;
    this.sessionStores.set(storeKey, sessionStore);

    await sessionStore.enablePersistence(`${companyId}_${sessionId}`).catch((e) =>
      logger.error(`[SessionManager] Failed to enable persistence for ${sessionId}: ${e.message}`)
    );

    const { state, saveCreds } = await this.authProvider.loadState(sessionId);

    // [SEC] A single findUnique miss here used to be treated as a permanent
    // "this session was deleted" verdict, deleting the in-memory metadata
    // that reconnectSession() needs — the NEXT scheduled reconnect attempt
    // then finds no metadata AND no DB row and gives up for good ("Cannot
    // reconnect, metadata lost"), turning what may be a transient read (a
    // write racing this reconnect, replica lag) into a WhatsApp line that
    // silently stops delivering messages until someone manually re-scans a
    // QR code. Retry briefly before accepting it as final.
    let dbSession = await prisma.whatsAppSession.findUnique({
      where: { sessionId },
    });
    for (let attempt = 1; !dbSession && attempt <= 3; attempt++) {
      logger.warn(
        `[SessionManager] Session ${sessionId} not found in DB on reconnect (attempt ${attempt}/3) — retrying before giving up.`
      );
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      dbSession = await prisma.whatsAppSession.findUnique({ where: { sessionId } });
    }

    if (!dbSession) {
      logger.warn(
        `[SessionManager] Session ${sessionId} was deleted from DB during initialization. Aborting socket creation.`
      );
      this.sessionStores.delete(storeKey);
      this.sessionMetadata.delete(sessionId);
      await sessionLockService.release(sessionId);
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

    const sock = await antiBanManager.initSession(sessionId, rawSock);

    bindSessionEvents(sock, sessionId, companyId, saveCreds, {
      eventBus: this.eventBus,
      healer: this.healer,
      store: sessionStore,
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
          logger.error(`[SessionManager] Failed to request pairing code for session ${sessionId}: ${err}`);
        }
      }, 1000);
    }

    return sock;
  }

  getSession(sessionId: string): WASocket | undefined {
    return this.sessions.get(sessionId);
  }

  // Teardown steps must never wedge the whole reconnect cycle: a hung await here
  // (seen live: antiBanManager.terminateSession never resolving after a
  // "deaf-session" close) left the session permanently DISCONNECTED because
  // initializeSession() awaits terminateSession() before creating the new socket.
  private async settleWithTimeout(
    step: Promise<unknown>,
    ms: number,
    label: string,
  ): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        logger.warn(`[SessionManager] ${label} did not settle within ${ms}ms — continuing teardown`);
        resolve();
      }, ms);
    });
    try {
      await Promise.race([step.catch((err) => {
        logger.warn(`[SessionManager] ${label} failed: ${err instanceof Error ? err.message : String(err)}`);
      }), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async terminateSession(
    sessionId: string,
    clearAuth: boolean = false,
  ): Promise<void> {
    logger.info(`[SessionManager] Terminating session ${sessionId}. Clear: ${clearAuth}`);

    await this.settleWithTimeout(sessionLockService.release(sessionId), 5000, "sessionLockService.release");
    await this.settleWithTimeout(antiBanManager.terminateSession(sessionId, true), 8000, "antiBanManager.terminateSession");
    this.healer.cleanupSession(sessionId);
    cleanupSessionLogger(sessionId);

    const meta = this.sessionMetadata.get(sessionId);
    const storeKey = meta ? `${meta.companyId}::${sessionId}` : sessionId;
    const store = this.sessionStores.get(storeKey) ?? this.sessionStores.get(sessionId);
    const resolvedStoreKey = this.sessionStores.has(storeKey) ? storeKey : sessionId;

    if (store) {
      store.disablePersistence();

      if (clearAuth) {
        store.flush();
        this.sessionStores.delete(resolvedStoreKey);
      } else {
        if (meta?.companyId) {
          await this.settleWithTimeout(
            store.writeToRedis(`${meta.companyId}_${sessionId}`),
            5000,
            "store.writeToRedis",
          );
        }
        this.sessionStores.delete(resolvedStoreKey);
      }
    }

    const sock = this.sessions.get(sessionId);
    if (sock) {
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");

      try {
        if (clearAuth) {
          // logout() round-trips to WhatsApp servers — on a dead socket it can
          // hang forever, so it gets the same teardown timeout treatment.
          await this.settleWithTimeout(sock.logout(), 10000, "sock.logout");
        } else {
          sock.end(undefined);
        }
      } catch {
        // ignore close errors
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

    try {
      if (clearAuth) {
        // [SEC] Full unlink (DELETE /sessions/:id from the UI's "Desconectar"
        // button — see frontend/src/components/IntegrationsPanel.tsx's
        // handleDeleteSession, which drops the session from local state and
        // expects it gone for good). This used to only flip status to
        // DISCONNECTED, never removing the row — so listSessions() (which
        // correctly reads the DB as the source of truth) kept resurrecting
        // "deleted" devices forever. No FK references WhatsAppSession.id/
        // sessionId from any other table (WhatsAppCredential.sessionId is a
        // plain string match, not a relation), so deleting is safe.
        await this.authProvider.clearCredentials(sessionId);
        await prisma.whatsAppSession.delete({ where: { sessionId } }).catch((err: { code?: string }) => {
          if (err?.code === "P2025") return; // already deleted, nothing to do
          throw err;
        });
      } else {
        await prisma.whatsAppSession.update({
          where: { sessionId },
          data: { status: "DISCONNECTED" },
        });
      }
    } catch (err) {
      logger.warn(`[SessionManager] Database update on disconnect failed: ${err.message}`);
    }
  }

  public async reconnectSession(sessionId: string): Promise<void> {
    const meta = this.sessionMetadata.get(sessionId);
    if (!meta) {
      const session = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
      });
      if (session) {
        await this.initializeSession({
          sessionId,
          companyId: session.companyId,
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
    });
  }

  getSessionStatus(sessionId: string): SessionStatus {
    const meta = this.sessionMetadata.get(sessionId);
    return { sessionId, status: meta?.status || "DISCONNECTED" };
  }

  async listSessions(companyId: string): Promise<SessionStatus[]> {
    // [SEC] The in-memory sessionMetadata Map only reflects sessions this exact
    // process has initialized since boot — after any restart, a session that was
    // DISCONNECTED (not CONNECTED) at shutdown is skipped by the boot auto-heal
    // loop (server.ts only restores CONNECTED sessions) and never re-enters this
    // Map. Reading memory-only meant those sessions vanished from the UI forever,
    // even with a fully intact DB record (phone, qrCode, etc). The DB is the
    // source of truth for "does this session exist"; memory only wins for the
    // live status of a session that's actually running in this process right now.
    const dbSessions = await whatsAppSessionRepository.findByCompany(companyId);
    return dbSessions.map((db) => {
      const meta = this.sessionMetadata.get(db.sessionId);
      const sock = this.sessions.get(db.sessionId);
      let phone = db.phone ?? undefined;
      if (sock?.user?.id) {
        phone = sock.user.id.split(":")[0].split("@")[0];
      }
      return {
        sessionId: db.sessionId,
        companyId: db.companyId,
        status: meta?.status ?? (db.status as SessionStatus["status"]),
        phone,
        qrCode: db.qrCode ?? undefined,
        profileName: db.profileName ?? undefined,
        updatedAt: db.updatedAt,
        createdAt: db.createdAt,
        defaultQueueId: db.defaultQueueId,
        proxyUrl: db.proxyUrl,
      };
    });
  }

  async findActiveSessionForCompany(
    companyId: string,
  ): Promise<{ sessionId: string; socket: WASocket } | null> {
    for (const [sessionId, socket] of this.sessions.entries()) {
      const meta = this.sessionMetadata.get(sessionId);
      if (meta?.companyId === companyId && meta.status === "CONNECTED") {
        return { sessionId, socket };
      }
    }

    const dbSession = await prisma.whatsAppSession.findFirst({
      where: {
        companyId,
        status: "CONNECTED",
        provider: "BAILEYS",
      },
    });

    if (dbSession) {
      const socket = this.sessions.get(dbSession.sessionId);
      if (socket) return { sessionId: dbSession.sessionId, socket };

      const owner = await sessionLockService.getOwner(dbSession.sessionId);
      if (owner && owner !== sessionLockService.instanceId) {
        // Session is genuinely alive on another replica — reconnecting here
        // would kick that live socket (`conflict: replaced`) for no reason.
        logger.info(
          `[SessionManager] ${dbSession.sessionId} is owned by instance ${owner}; not reconnecting locally.`,
        );
        return null;
      }

      if (!this.healer.hasReconnectPending(dbSession.sessionId)) {
        logger.warn(
          `[SessionManager] Zombie session detected: ${dbSession.sessionId} (lock unowned/expired). Auto-reconnecting.`,
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
export default SessionManager;
