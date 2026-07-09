/**
 *  SESSION EVENT BINDER
 *
 * Wires Baileys socket events to the internal EventBus:
 * - connection.update (QR, open, close with reconnect logic)
 * - messaging-history.set (history sync offload to DB)
 * - messages.upsert (new inbound messages)
 * - messages.update (delivery/read status updates)
 * - presence.update (typing indicators)
 * - creds.update (auth persistence)
 */

import {
  WASocket,
  DisconnectReason,
  WAMessage,
  WAMessageUpdate,
  proto,
} from "@whiskeysockets/baileys";
import { HistoryChat, HistoryContact } from "@/services/sync/ChatSyncIngest";
import { EventBus } from "../../core/events/EventBus";
import {
  WhatsAppEventType,
  WhatsAppEventData,
} from "../../core/events/WhatsAppEvents";
import { ConnectionHealer } from "../ConnectionHealer";
import { sessionModuleLogger as logger } from "../SessionLogger";
import {
  ConnectionUpdateSchema,
  MessagesUpsertSchema,
  MessageUpdateSchema,
  PresenceUpdateSchema,
  HistorySyncSchema,
  validateBaileysEvent,
} from "../../core/validation/baileys.schemas";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import TenantContextManager from "@/config/tenantContext";
import { chatSyncService } from "@/services/ChatSyncService";
import { syncMessageParser } from "@/services/sync/SyncMessageParser";
import type { SessionStatus } from "../../core/types/whatsapp.types";
import type { SimpleInMemoryStore } from "../SimpleStore";
import { auditService } from "@/services/AuditService";
import { antiBanManager, classifyDisconnect } from "@/whatsapp/services/AntiBanManager";
import { proto as BaileysProto } from "@whiskeysockets/baileys";

/** Dependencies injected from SessionManager */
export interface SessionEventBinderDeps {
  eventBus: EventBus;
  healer: ConnectionHealer;
  store: SimpleInMemoryStore;
  sessions: Map<string, WASocket>;
  sessionMetadata: Map<
    string,
    { companyId: string; status: SessionStatus["status"]; isPairing?: boolean }
  >;
  terminateSession: (sessionId: string, clearAuth?: boolean) => Promise<void>;
  reconnectSession: (sessionId: string) => Promise<void>;
}

// Stale name patterns created by old fallback bugs — safe to overwrite with real pushName.
const STALE_NAME_RE = /^(\+unknown|Participante|ID: \d+)$/;

/**
 * [Baileys 7] `contacts.update.id` is "either in lid or jid format (preferred)" —
 * for LID-addressed contacts the real phone JID comes in `update.phoneNumber`
 * instead, or (if WhatsApp omitted it) from the LID↔PN map SimpleStore builds
 * from message metadata (`key.senderPn`/`remoteJidAlt`). Without this, phone
 * lookups below run against LID digits and never match a real User/Contact.
 */
function resolveRealJid(
  id: string,
  phoneNumber: string | undefined,
  store: SimpleInMemoryStore,
): string {
  if (phoneNumber) return phoneNumber;
  if (id.includes("@lid")) {
    return store.getPhoneFromLid(id) || id;
  }
  return id;
}

/**
 * [Baileys 7] contacts.update also carries notify (pushName) and verifiedName.
 * If the User in DB has a stale name ("+unknown", "Participante", "ID: …"), heal it.
 * Fire-and-forget — errors are logged and never thrown.
 */
async function persistContactName(
  jid: string,
  notify: string,
  companyId: string,
): Promise<void> {
  const base = jid.split("@")[0].split(":")[0];
  if (!base || base.length < 3) return;
  const email = `${base}@whatsapp.user`;

  const [{ userRepository }, { TenantContextManager: TCM }] = await Promise.all([
    import("@/repositories/UserRepository"),
    import("@/config/tenantContext"),
  ]);

  await TCM.runAsSystem(async () => {
    const user = await userRepository.findFirst({
      where: { companyId, email },
      select: { id: true, name: true },
    });
    if (!user || !STALE_NAME_RE.test(user.name)) return;

    await userRepository.update(user.id, companyId, { name: notify });
    logger.info(`[SessionEventBinder] [contacts.update] Healed stale name: ${base} → "${notify}"`);
  });
}

/**
 * Fetches the current WhatsApp profile picture URL, uploads it to persistent
 * storage, updates User + Contact records in DB, and emits a Socket.IO
 * contact.updated event. Called when Baileys fires contacts.update with an imgUrl.
 *
 * [BUG FIX] Baileys 7's "picture" notification handler (messages-recv.js,
 * `case 'picture':`) never puts a real URL in `imgUrl` — it hardcodes the
 * sentinel string "changed" (or "removed" on deletion): `imgUrl: setPicture
 * ? 'changed' : 'removed'`. Treating that literal string as a downloadable
 * URL made every `axios.get` fail and persisted the literal text "changed"
 * as the profile pic URL, so pictures that WERE public never rendered.
 * The correct flow (per Baileys docs) is to treat imgUrl as a change
 * notification and re-fetch the real URL via `sock.profilePictureUrl()`.
 */
async function persistContactProfilePic(
  sock: WASocket,
  jid: string,
  imgUrl: string,
  sessionId: string,
  companyId: string,
): Promise<void> {
  // Extract normalized phone (digits only, no @domain)
  const phone = jid.split("@")[0].split(":")[0];
  if (!phone || !/^\d{7,15}$/.test(phone)) return;

  const [
    { userRepository },
    { contactRepository },
    { TenantContextManager },
    { storageService },
    { gateway },
    axios,
  ] = await Promise.all([
    import("@/repositories/UserRepository"),
    import("@/repositories/ContactRepository"),
    import("@/config/tenantContext"),
    import("@/services/StorageService"),
    import("@/gateways/socketGateway"),
    import("axios").then((m) => m.default),
  ]);

  await TenantContextManager.runAsSystem(async () => {
    const user = await userRepository.findFirst({
      where: { companyId, phone },
      select: { id: true, profilePicUrl: true, phone: true },
    });
    if (!user) return;

    if (imgUrl === "removed") {
      await userRepository.update(user.id, companyId, { profilePicUrl: null });
      if (user.phone) {
        await contactRepository.updateMany({
          where: { companyId, phone: user.phone },
          data: { profilePicUrl: null },
        });
      }
      gateway.emitToCompany(companyId, "contact.updated", {
        id: user.id,
        profilePicUrl: null,
        phone: user.phone,
      });
      return;
    }

    // Skip if already has a persistent non-WA URL (amazonaws, GCS, minio, local)
    const existing = user.profilePicUrl;
    if (
      existing &&
      !existing.includes("pps.whatsapp.net") &&
      (existing.includes("amazonaws.com") ||
        existing.includes("storage.googleapis.com") ||
        existing.startsWith("/uploads") ||
        existing.includes("minio"))
    ) {
      return;
    }

    // `imgUrl` is just a "changed" notification — fetch the actual current URL.
    // Try "image" quality first, then "preview" (mirrors ProfilePictureService).
    const PP_TIMEOUT = 15_000;
    let fetchedUrl: string | undefined;
    try {
      fetchedUrl = await sock.profilePictureUrl(jid, "image", PP_TIMEOUT);
    } catch {
      try {
        fetchedUrl = await sock.profilePictureUrl(jid, "preview", PP_TIMEOUT);
      } catch {
        fetchedUrl = undefined;
      }
    }
    if (!fetchedUrl) {
      logger.info(
        `[SessionEventBinder] [contacts.update] No profile picture available for ${phone} (session ${sessionId})`,
      );
      return;
    }

    let profilePicUrl: string;
    try {
      const response = await axios.get(fetchedUrl, {
        responseType: "arraybuffer",
        timeout: 10000,
      });
      const buffer = Buffer.from(response.data as ArrayBuffer);
      const mimeType = (response.headers["content-type"] as string) || "image/jpeg";
      const filename = `profile_${user.id}_${Date.now()}.jpg`;
      const uploadResult = await storageService.uploadFile(companyId, buffer, filename, mimeType);
      profilePicUrl = uploadResult.url;
    } catch {
      // Direct WA link may still work client-side even if the server-side download failed
      profilePicUrl = fetchedUrl;
    }

    await userRepository.update(user.id, companyId, { profilePicUrl });

    if (user.phone) {
      await contactRepository.updateMany({
        where: { companyId, phone: user.phone },
        data: { profilePicUrl },
      });
    }

    gateway.emitToCompany(companyId, "contact.updated", {
      id: user.id,
      profilePicUrl,
      phone: user.phone,
    });

    logger.info(
      `[SessionEventBinder] [contacts.update] Profile pic persisted for ${phone} (session ${sessionId})`,
    );
  });
}

export function bindSessionEvents(
  sock: WASocket,
  sessionId: string,
  companyId: string,
  saveCreds: () => Promise<void>,
  deps: SessionEventBinderDeps,
): void {
  const {
    eventBus,
    healer,
    store,
    sessions,
    sessionMetadata,
    terminateSession,
    reconnectSession,
  } = deps;

  //  Bind Store (Memory Only for Baileys usage)
  store.bind(sock.ev);

  // [Baileys 7] contacts.update fires on session start (full sync) and on individual changes.
  // Payload: { id, notify?, verifiedName?, imgUrl?, name? }
  // notify = pushName (WhatsApp display name set by the contact on their device).
  sock.ev.on("contacts.update", (updates) => {
    for (const update of updates) {
      if (!update.id) continue;

      // Resolve LID → real phone JID before any phone-based DB lookup (see resolveRealJid).
      const realJid = resolveRealJid(update.id, update.phoneNumber, store);

      // Heal stale names ("+unknown", "Participante", "ID: …") with real pushName.
      const displayName = update.notify || update.verifiedName;
      if (displayName) {
        persistContactName(realJid, displayName, companyId).catch((err) =>
          logger.warn(`[SessionEventBinder] contacts.update name heal failed for ${update.id}: ${err instanceof Error ? err.message : err}`),
        );
      }

      // Persist new profile picture when imgUrl changes.
      if (update.imgUrl) {
        persistContactProfilePic(sock, realJid, update.imgUrl, sessionId, companyId).catch((err) =>
          logger.warn(`[SessionEventBinder] contacts.update pic persist failed for ${update.id}: ${err instanceof Error ? err.message : err}`),
        );
      }
    }
  });

  //  Enterprise Persistence: Ingest history to DB
  sock.ev.on("messaging-history.set", (rawData: unknown) => {
    const validated = validateBaileysEvent(
      HistorySyncSchema,
      rawData,
      "messaging-history.set",
      { sessionId, companyId },
    );
    if (!validated) return;

    const { messages, chats, contacts, syncType } = validated;

    // ON_DEMAND batches come from an explicit fetchMessageHistory() (manual / on-demand
    // sync the agent triggered). They must be ingested in FULL — truncating them is
    // exactly what dropped the older backfilled messages ("omite algunos"). The per-chat
    // cap only protects the DB pool during the massive initial bootstrap on first link.
    const isOnDemand =
      syncType === proto.HistorySync.HistorySyncType.ON_DEMAND;

    const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY === "true";
    // Per-chat cap creates PERMANENT holes in the middle of a chat's history:
    // each history event delivers a window of messages and slicing keeps only the
    // newest N of that window, discarding a range that backward pagination
    // (anchored on the global oldest) can never reach again. Keep the cap as an
    // OOM guard but high enough that it rarely bites; the global
    // MAX_HISTORY_SYNC_MESSAGES (1500/event) remains the primary memory bound.
    const MAX_MESSAGES_PER_CHAT = process.env.WA_HISTORY_LIMIT_PER_CHAT
      ? parseInt(process.env.WA_HISTORY_LIMIT_PER_CHAT, 10)
      : (syncFullHistory ? 1000 : 500);

    const syncMessages: WAMessage[] = [];

    if (messages && messages.length > 0) {
      const messagesByChat = new Map<string, WAMessage[]>();
      const rawMessages = messages as WAMessage[];

      for (const msg of rawMessages) {
        const jid = msg.key?.remoteJid;
        if (!jid) continue;
        if (!messagesByChat.has(jid)) messagesByChat.set(jid, []);
        messagesByChat.get(jid)!.push(msg);
      }

      for (const chatMsgs of messagesByChat.values()) {
        chatMsgs.sort((a, b) => {
          const tA = syncMessageParser.getTimestamp(a.messageTimestamp);
          const tB = syncMessageParser.getTimestamp(b.messageTimestamp);
          return tB - tA;
        });
        // On-demand: keep everything WhatsApp sent back. Bulk: keep the newest N.
        syncMessages.push(
          ...(isOnDemand ? chatMsgs : chatMsgs.slice(0, MAX_MESSAGES_PER_CHAT)),
        );
      }

      logger.debug(
        `[SessionManager]  History Sync for ${sessionId}: ${syncMessages.length} messages, ${chats?.length || 0} chats, ${contacts?.length || 0} contacts ${isOnDemand ? "[ON-DEMAND · full ingest]" : "[bulk · capped]"}`,
      );
    }

    chatSyncService
      .handleHistorySync(companyId, syncMessages, chats as HistoryChat[], contacts as HistoryContact[], { onDemand: isOnDemand })
      .catch((err) => {
        logger.error(`[SessionManager] History ingest failed: ${err}`);
      });
  });

  const syncSessionPhone = async () => {
    if (sock.user?.id) {
      const phoneNumber = sock.user.id.split(":")[0].split("@")[0];
      try {
        await TenantContextManager.runAsSystem(async () => {
          const record = await whatsappSessionRepository.findOne(companyId, sessionId);
          if (record && record.phone !== phoneNumber) {
            await whatsappSessionRepository.updateSystemSession(sessionId, {
              phone: phoneNumber,
            });
            logger.info(`[SessionEventBinder] Updated phone number in DB for ${sessionId}: ${phoneNumber}`);
          }
        });
      } catch (err) {
        logger.error(`[SessionEventBinder] Failed to sync session phone: ${err}`);
      }
    }
  };

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await syncSessionPhone();
  });

  // Connection state
  sock.ev.on("connection.update", async (rawUpdate: unknown) => {
    const validated = validateBaileysEvent(
      ConnectionUpdateSchema,
      rawUpdate,
      "connection.update",
      { sessionId, companyId },
    );
    if (!validated) return;

    const { connection, lastDisconnect, qr } = validated;

    if (qr) {
      const meta = sessionMetadata.get(sessionId);
      if (meta?.isPairing) {
        logger.info(`[SessionEventBinder] Ignoring QR code generation for session ${sessionId} because it is in phone pairing mode.`);
      } else {
        eventBus.publish({
          type: WhatsAppEventType.SESSION_QR_CODE,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { qr },
        });

        // [SEC] Audit: QR Emitted
        await auditService.logWhatsAppEvent(companyId, sessionId, "SCANNING", { qrLength: qr.length });

        await TenantContextManager.runAsSystem(async () =>
          whatsappSessionRepository.updateSystemSession(sessionId, {
            qrCode: qr,
            status: "SCANNING",
            phone: null,
          }),
        ).catch(async (err: { code?: string; message?: string }) => {
          if (err?.code === "P2025") {
            logger.warn(`[SessionEventBinder] QR update failed: session ${sessionId} not found in DB. Terminating session.`);
            await terminateSession(sessionId, true).catch((termErr) => {
              logger.error({ err: termErr }, `[SessionEventBinder] Failed to terminate session ${sessionId} on P2025`);
            });
          }
        });
      }
    }

    if (connection === "open") {
      let phoneNumber: string | null = null;
      if (sock.user?.id) {
        phoneNumber = sock.user.id.split(":")[0].split("@")[0];
      }

      logger.info(`[SessionManager] Session ${sessionId} CONNECTED [OK] Phone: ${phoneNumber || "Unknown"}`);
      
      // [SEC] Audit: Connected
      await auditService.logWhatsAppEvent(companyId, sessionId, "CONNECTED", { phone: phoneNumber });

      sessionMetadata.set(sessionId, { companyId, status: "CONNECTED", isPairing: false });

      await TenantContextManager.runAsSystem(async () =>
        whatsappSessionRepository.updateSystemSession(sessionId, {
          qrCode: null,
          status: "CONNECTED",
          phone: phoneNumber,
        }),
      ).catch(async (err: { code?: string }) => {
        if (err?.code === "P2025") {
          logger.warn(`[SessionEventBinder] Connection open update failed: session ${sessionId} not found in DB. Terminating session.`);
          await terminateSession(sessionId, true).catch((termErr) => {
            logger.error({ err: termErr }, `[SessionEventBinder] Failed to terminate session ${sessionId} on P2025`);
          });
        }
      });

      // Sync phone immediately if it's available
      await syncSessionPhone();

      eventBus.publish({
        type: WhatsAppEventType.SESSION_CONNECTED,
        sessionId,
        companyId,
        timestamp: new Date(),
        data: { phone: phoneNumber || undefined },
      });

      // Notify antiban that we're reconnected (resets health risk factor)
      antiBanManager.notifyReconnect(sessionId);
      // Start background human-like entropy (idle typing, delayed reads, presence cycles)
      antiBanManager.startEntropy(sessionId);

      healer.resetRetryCount(sessionId);
      healer.startHeartbeat(sessionId, sock, () => sessions.has(sessionId));
    }

    if (connection === "close") {
      const boomError = lastDisconnect?.error as {
        output?: { statusCode: number };
        message?: string;
      };

      const statusCode = boomError?.output?.statusCode ?? 0;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const errorMsg = boomError?.message || "Unknown";

      // Classify the disconnect reason for observability and health tracking
      const classification = classifyDisconnect(statusCode);
      logger.warn(
        `[SessionManager] Session ${sessionId} CLOSED. Reason: ${errorMsg} | ` +
        `Category: ${classification.category} | ShouldReconnect: ${classification.shouldReconnect}` +
        (classification.backoffMs ? ` | RecommendedBackoff: ${classification.backoffMs}ms` : ""),
      );

      // Stop idle-entropy and notify the antiban health tracker
      antiBanManager.stopEntropy(sessionId);
      antiBanManager.notifyDisconnect(sessionId, statusCode || errorMsg);

      // [SEC] Audit: Disconnected
      await auditService.logWhatsAppEvent(companyId, sessionId, "DISCONNECTED", { 
        reason: errorMsg, 
        isReconnecting: true,
        statusCode: boomError?.output?.statusCode
      });

      try { sock.end(undefined); } catch { /* Ignore socket close errors during cleanup */ }
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");
      sock.ev.removeAllListeners("messaging-history.set");
      sock.ev.removeAllListeners("messages.update");
      sock.ev.removeAllListeners("presence.update");
      healer.stopHeartbeat(sessionId);

      sessionMetadata.set(sessionId, { companyId, status: "DISCONNECTED", isPairing: false });
      
      healer.scheduleReconnect(
        sessionId,
        errorMsg,
        (sid) => reconnectSession(sid),
        isLoggedOut,
        async () => {
          logger.warn(`[SessionEventBinder] LoggedOut attempts exhausted for session ${sessionId}. Performing soft-disconnect.`);
          await terminateSession(sessionId, false);
        },
        statusCode,
      );

      eventBus.publish({
        type: WhatsAppEventType.SESSION_DISCONNECTED,
        sessionId,
        companyId,
        timestamp: new Date(),
        data: { reason: errorMsg, isReconnecting: true },
      });
    }
  });

  /**
   * Routes a single message through the REAL-TIME inbound pipeline:
   * unwraps wrappers, dispatches revocations/reactions, and publishes
   * MESSAGE_RECEIVED (which emits socket events to the frontend + triggers AI).
   * Shared by both `notify` and fresh `append` messages.
   */
  const dispatchRealtimeMessage = (msg: (typeof MessagesUpsertSchema._type)["messages"][number]) => {
    if (!msg.message) {
      logger.debug(`[SessionEventBinder] Skipping msg with no .message: ${msg.key?.id}`);
      return;
    }
    let msgContent = msg.message as Record<string, unknown>;

    // Unwrap specific types
    if (msgContent["ephemeralMessage"]) {
      const eph = msgContent["ephemeralMessage"] as Record<string, unknown>;
      if (eph["message"]) msgContent = eph["message"] as Record<string, unknown>;
    }
    if (msgContent["viewOnceMessageV2"]) {
      const v2 = msgContent["viewOnceMessageV2"] as Record<string, unknown>;
      if (v2["message"]) msgContent = v2["message"] as Record<string, unknown>;
    }

    // Protocol message handling (revocations, internal messages)
    const proto = msgContent["protocolMessage"] as Record<string, unknown> | undefined;
    if (proto) {
      // Revocation (Delete for Everyone)
      const protoType = proto["type"];
      const protoKey = proto["key"] as Record<string, unknown> | undefined;
      if ((protoType === 0 || protoType === "REVOKE" || !protoType) && protoKey?.["id"]) {
        eventBus.publish({
          type: WhatsAppEventType.MESSAGE_REVOKED,
          sessionId, companyId, timestamp: new Date(),
          data: { revokedMessageId: String(protoKey["id"]), revokedBy: msg.key.remoteJid || "unknown", fromMe: msg.key.fromMe || false },
        });
      } else if ((protoType === 14 || protoType === "MESSAGE_EDIT") && protoKey?.["id"] && proto["editedMessage"]) {
        logger.info(`[SessionEventBinder] Intercepting MESSAGE_EDIT for ${protoKey["id"]} in session ${sessionId}`);
        eventBus.publish({
          type: WhatsAppEventType.MESSAGE_EDITED,
          sessionId, companyId, timestamp: new Date(),
          data: {
            originalMessageId: String(protoKey["id"]),
            editedMessage: proto["editedMessage"],
          },
        });
      } else {
        logger.debug(`[SessionEventBinder] Skipping internal protocolMessage type: ${protoType} for ${msg.key?.id}`);
      }
      return; // ALL protocolMessages are internal — never process as chat messages
    }

    // Reaction check
    const react = msgContent["reactionMessage"] as Record<string, unknown> | undefined;
    if (react) {
      const reactKey = react["key"] as Record<string, unknown> | undefined;
      if (reactKey?.["id"]) {
        eventBus.publish({
          type: WhatsAppEventType.MESSAGE_REACTION,
          sessionId, companyId, timestamp: new Date(),
          data: { messageId: String(reactKey["id"]), reaction: String(react["text"] || ""), participant: msg.key.participant || msg.key.remoteJid || "unknown" },
        });
        return;
      }
    }

    logger.debug(`[SessionEventBinder] Publishing MESSAGE_RECEIVED to EventBus: ${msg.key?.id}`);
    eventBus.publish({
      type: WhatsAppEventType.MESSAGE_RECEIVED,
      sessionId, companyId, timestamp: new Date(),
      // [SEC] CAST NOTE: We cast 'msg' (validated zod output) to WAMessage to satisfy Baileys interfaces.
      // The Zod schema (MessagesUpsertSchema) ensures structural compatibility.
      data: { message: msg as unknown as WAMessage },
    });
  };

  // Message listener (notify + fresh append)
  sock.ev.on("messages.upsert", async (rawData: unknown) => {
    logger.debug(`[SessionEventBinder] messages.upsert FIRED for session ${sessionId}`);
    const validated = validateBaileysEvent(MessagesUpsertSchema, rawData, "messages.upsert", { sessionId, companyId });
    if (!validated) {
      logger.warn(`[SessionEventBinder] Zod validation FAILED for messages.upsert — event dropped (session: ${sessionId})`);
      return;
    }
    logger.debug(`[SessionEventBinder] Validated. Type: ${validated.type}, Count: ${validated.messages?.length}`);
    if (validated && validated.type === "notify") {
      logger.debug(`[SessionEventBinder] Processing ${validated.messages.length} notify messages`);
      const ab = antiBanManager.getSession(sessionId);
      for (const msg of validated.messages) {
        // Track delivery confirmations for our outbound messages
        if (msg.key.fromMe && msg.key.id) {
          ab?.deliveryTracker.onMessageSent(msg.key.id);
        }
        dispatchRealtimeMessage(msg);
      }
    } else if (validated && validated.type === "append") {
      // [INBOUND RACE FIX] Baileys delivers genuinely-new inbound messages as BOTH a
      // `notify` AND an `append` upsert. Previously ALL append messages were dumped into
      // the silent History-Sync path (which persists to DB but emits NO socket event).
      // When the append won the race, the message was saved silently and the later `notify`
      // was deduped away by doesMessageExist() — so the message NEVER appeared live.
      //
      // Fix: split fresh real-time messages (recent timestamp) out of the append batch and
      // route them through the SAME real-time pipeline as `notify`. The InboundMessageHandler
      // already dedupes by message id / content, so processing a message via both paths is safe
      // (only the first wins and emits). Only genuinely OLD messages go to History-Sync.
      const REALTIME_WINDOW_SECONDS = 120; // 2 minutes
      const nowSeconds = Date.now() / 1000;

      const realtimeMsgs: typeof validated.messages = [];
      const historyMsgs: typeof validated.messages = [];

      for (const msg of validated.messages) {
        const ts = syncMessageParser.getTimestamp(msg.messageTimestamp);
        const isFresh = ts > 0 && nowSeconds - ts < REALTIME_WINDOW_SECONDS;
        if (isFresh && msg.message) {
          realtimeMsgs.push(msg);
        } else {
          historyMsgs.push(msg);
        }
      }

      if (realtimeMsgs.length > 0) {
        logger.info(`[SessionEventBinder] Routing ${realtimeMsgs.length} FRESH append messages through real-time pipeline`);
        for (const msg of realtimeMsgs) {
          dispatchRealtimeMessage(msg);
        }
      }

      if (historyMsgs.length > 0) {
        logger.info(`[SessionEventBinder] Processing ${historyMsgs.length} APPEND messages via History Sync`);
        chatSyncService
          .handleHistorySync(companyId, historyMsgs as unknown as WAMessage[], [], [])
          .catch((err) => {
            logger.error(`[SessionManager] Append ingest failed: ${err}`);
          });
      }
    } else {
      logger.debug(`[SessionEventBinder] Skipping non-notify upsert type: ${validated?.type}`);
    }
  });

  sock.ev.on("messages.update", async (rawUpdates: unknown) => {
    if (Array.isArray(rawUpdates)) {
      const ab = antiBanManager.getSession(sessionId);
      for (const rawUpdate of rawUpdates) {
        // Bad MAC detection: CIPHERTEXT stub type signals a failed decrypt
        const stubType = (rawUpdate as Record<string, unknown>)?.update as Record<string, unknown> | undefined;
        if (
          stubType?.messageStubType === BaileysProto.WebMessageInfo.StubType.CIPHERTEXT
        ) {
          ab?.healthMonitor.recordDecryptFail(true);
        }

        const validated = validateBaileysEvent(MessageUpdateSchema, rawUpdate, "messages.update", { sessionId, companyId });
        if (validated && validated.key?.id) {
          // Delivery receipt: status ≥ 3 means DELIVERY_ACK or READ
          const status = validated.update?.status;
          if (typeof status === "number" && status >= 3 && validated.key.id) {
            ab?.deliveryTracker.onDeliveryReceipt(validated.key.id);
          }

          eventBus.publish({
            type: WhatsAppEventType.MESSAGE_UPDATE,
            sessionId, companyId, timestamp: new Date(),
            data: { messageId: validated.key.id, update: validated as unknown as WAMessageUpdate },
          });
        }
      }
    }
  });

  sock.ev.on("presence.update", (rawData: unknown) => {
    const validated = validateBaileysEvent(PresenceUpdateSchema, rawData, "presence.update", { sessionId, companyId });
    if (validated) {
      eventBus.publish({
        type: WhatsAppEventType.PRESENCE_UPDATE,
        sessionId, companyId, timestamp: new Date(),
        data: validated as WhatsAppEventData[WhatsAppEventType.PRESENCE_UPDATE],
      });
    }
  });
}
