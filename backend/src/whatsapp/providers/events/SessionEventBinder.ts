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
import type { SessionStatus } from "../../core/types/whatsapp.types";
import type { SimpleInMemoryStore } from "../SimpleStore";
import { auditService } from "@/services/AuditService";

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

  //  Enterprise Persistence: Ingest history to DB
  sock.ev.on("messaging-history.set", (rawData: unknown) => {
    const validated = validateBaileysEvent(
      HistorySyncSchema,
      rawData,
      "messaging-history.set",
      { sessionId, companyId },
    );
    if (!validated) return;

    const { messages, chats, contacts } = validated;
    
    const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY === "true";
    const MAX_MESSAGES_PER_CHAT = process.env.WA_HISTORY_LIMIT_PER_CHAT 
      ? parseInt(process.env.WA_HISTORY_LIMIT_PER_CHAT, 10) 
      : (syncFullHistory ? 100 : 20);

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
          const tA = Number(a.messageTimestamp || 0);
          const tB = Number(b.messageTimestamp || 0);
          return tB - tA;
        });
        syncMessages.push(...chatMsgs.slice(0, MAX_MESSAGES_PER_CHAT));
      }

      logger.info(
        `[SessionManager]  History Sync for ${sessionId}: ${syncMessages.length} messages, ${chats?.length || 0} chats, ${contacts?.length || 0} contacts`,
      );
    }

    chatSyncService
      .handleHistorySync(companyId, syncMessages, chats as HistoryChat[], contacts as HistoryContact[])
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

      healer.resetRetryCount(sessionId);
      healer.startHeartbeat(sessionId, sock, () => sessions.has(sessionId));
    }

    if (connection === "close") {
      const boomError = lastDisconnect?.error as {
        output?: { statusCode: number };
        message?: string;
      };

      const isLoggedOut = boomError?.output?.statusCode === DisconnectReason.loggedOut;
      const errorMsg = boomError?.message || "Unknown";

      logger.warn(`[SessionManager] Session ${sessionId} CLOSED. Reason: ${errorMsg}. Reconnect: true (LoggedOut: ${isLoggedOut})`);

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
        }
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
      for (const msg of validated.messages) {
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
        const ts = Number(msg.messageTimestamp || 0);
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
      for (const rawUpdate of rawUpdates) {
        const validated = validateBaileysEvent(MessageUpdateSchema, rawUpdate, "messages.update", { sessionId, companyId });
        if (validated && validated.key?.id) {
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
