/**
 * 🔌 SESSION EVENT BINDER
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
import { chatSyncService } from "@/services/chatSyncService";
import type { SessionStatus } from "../../core/types/whatsapp.types";
import type { SimpleInMemoryStore } from "../SimpleStore";

/** Dependencies injected from SessionManager */
export interface SessionEventBinderDeps {
  eventBus: EventBus;
  healer: ConnectionHealer;
  store: SimpleInMemoryStore;
  sessions: Map<string, WASocket>;
  sessionMetadata: Map<
    string,
    { companyId: string; status: SessionStatus["status"] }
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

  // 🔗 Bind Store (Memory Only for Baileys usage)
  store.bind(sock.ev);

  // 🚀 Enterprise Persistence: Ingest history to DB
  sock.ev.on("messaging-history.set", (rawData: unknown) => {
    const validated = validateBaileysEvent(
      HistorySyncSchema,
      rawData,
      "messaging-history.set",
      { sessionId, companyId },
    );
    if (!validated) return;

    const { messages, chats, contacts } = validated;
    
    // 🧠 SMART SYNC STRATEGY: 
    // 1. Identity Sync: Always process chats/contacts (Shell Creation)
    // 2. Message Sync: Process limited messages if Full Sync is OFF, or more if ON.
    
    const syncFullHistory = process.env.WA_SYNC_FULL_HISTORY === "true";
    const MAX_MESSAGES_PER_CHAT = process.env.WA_HISTORY_LIMIT_PER_CHAT 
      ? parseInt(process.env.WA_HISTORY_LIMIT_PER_CHAT, 10) 
      : (syncFullHistory ? 100 : 20); // 🚀 20 messages is enough for a sidebar preview

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

      let skippedCount = 0;
      for (const chatMsgs of messagesByChat.values()) {
        chatMsgs.sort((a, b) => {
          const tA = Number(a.messageTimestamp || 0);
          const tB = Number(b.messageTimestamp || 0);
          return tB - tA; // Newest first
        });

        if (chatMsgs.length > MAX_MESSAGES_PER_CHAT) {
          skippedCount += chatMsgs.length - MAX_MESSAGES_PER_CHAT;
        }

        syncMessages.push(...chatMsgs.slice(0, MAX_MESSAGES_PER_CHAT));
      }

      logger.info(
        `[SessionManager] 📥 History Sync for ${sessionId}: ${syncMessages.length} messages (📉 Skipped: ${skippedCount} older), ${chats?.length || 0} chats, ${contacts?.length || 0} contacts`,
      );
    } else {
      logger.info(
        `[SessionManager] 👤 Discovery Sync for ${sessionId}: ${chats?.length || 0} chats found (0 messages in payload)`,
      );
    }

    chatSyncService
      .handleHistorySync(companyId, syncMessages, chats as HistoryChat[], contacts as HistoryContact[])
      .catch((err) => {
        logger.error(`[SessionManager] History ingest failed: ${err}`);
      });
  });

  sock.ev.on("creds.update", saveCreds);

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
      eventBus.publish({
        type: WhatsAppEventType.SESSION_QR_CODE,
        sessionId,
        companyId,
        timestamp: new Date(),
        data: { qr },
      });

      await TenantContextManager.runAsSystem(async () =>
        whatsappSessionRepository.updateSystemSession(sessionId, {
          qrCode: qr,
          status: "SCANNING",
        }),
      ).catch(async (err: { code?: string; message?: string }) => {
        if (err?.code === "P2025") {
          logger.warn(
            `[SessionManager] Session ${sessionId} not in DB during QR. Self-healing: recreating record.`,
          );
          await TenantContextManager.runAsSystem(async () =>
            whatsappSessionRepository.createSessionRecord({
              sessionId,
              companyId,
              status: "SCANNING",
              phone: null,
            }),
          ).catch((createErr) =>
            logger.error(
              `[DB Error] Failed to self-heal session record during QR: ${createErr}`,
            ),
          );
          return;
        }
        logger.error(`[DB Error] Update QR: ${err.message || err}`);
      });
    }

    if (connection === "open") {
      let phoneNumber: string | null = null;
      if (sock.user?.id) {
        phoneNumber = sock.user.id.split(":")[0].split("@")[0];
      }

      logger.info(
        `[SessionManager] Session ${sessionId} CONNECTED ✅ Phone: ${phoneNumber || "Unknown"}`,
      );
      sessionMetadata.set(sessionId, { companyId, status: "CONNECTED" });

      await TenantContextManager.runAsSystem(async () =>
        whatsappSessionRepository.updateSystemSession(sessionId, {
          qrCode: null,
          status: "CONNECTED",
          phone: phoneNumber,
        }),
      ).catch(async (err: { code?: string }) => {
        if (err?.code === "P2025") {
          // 🛡️ SELF-HEALING: Session record was deleted (cleanup/migration). Recreate it.
          logger.warn(
            `[SessionManager] Session ${sessionId} not in DB (post-cleanup). Self-healing: recreating record.`,
          );
          await TenantContextManager.runAsSystem(async () =>
            whatsappSessionRepository.createSessionRecord({
              sessionId,
              companyId,
              status: "CONNECTED",
              phone: phoneNumber,
            }),
          ).catch((createErr) =>
            logger.error(
              `[DB Error] Failed to self-heal session record: ${createErr}`,
            ),
          );
          return;
        }
        logger.error(`[DB Error] Update session status: ${err}`);
      });

      eventBus.publish({
        type: WhatsAppEventType.SESSION_CONNECTED,
        sessionId,
        companyId,
        timestamp: new Date(),
        data: { phone: phoneNumber || undefined },
      });

      // ⚡ Delegate heartbeat to ConnectionHealer
      healer.startHeartbeat(sessionId, sock, () => sessions.has(sessionId));
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

      // 🛑 Force kill the socket to prevent zombies
      try {
        sock.end(undefined);
      } catch {
        // Ignore end errors
      }

      // Cleanup listeners
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");

      healer.stopHeartbeat(sessionId);

      if (resetConnection) {
        sessionMetadata.set(sessionId, {
          companyId,
          status: "DISCONNECTED",
        });
        // Delegate smart reconnect to ConnectionHealer
        healer.scheduleReconnect(sessionId, errorMsg, (sid) =>
          reconnectSession(sid),
        );
      } else {
        await terminateSession(sessionId, true);
      }

      eventBus.publish({
        type: WhatsAppEventType.SESSION_DISCONNECTED,
        sessionId,
        companyId,
        timestamp: new Date(),
        data: { reason: errorMsg, isReconnecting: resetConnection },
      });
    }
  });

  // Message listener
  sock.ev.on("messages.upsert", async (rawData: unknown) => {
    logger.info(
      `[SessionManager] raw messages.upsert fired: ${JSON.stringify(rawData).substring(0, 300)}...`,
    );
    const validated = validateBaileysEvent(
      MessagesUpsertSchema,
      rawData,
      "messages.upsert",
      { sessionId, companyId },
    );

    if (!validated) {
      logger.warn(
        `[SessionManager] Validation failed for messages.upsert in session ${sessionId}`,
      );
      return;
    }

    // ONLY process 'notify' (new messages) to prevent history sync floods
    if (validated.type === "notify") {
      for (const msg of validated.messages) {
        if (!msg.message) continue;

        let msgContent = msg.message;

        // 🛡️ Unwrap nested messages (Ephemeral, viewOnce)
        if (msgContent?.ephemeralMessage?.message) {
          msgContent = msgContent.ephemeralMessage.message;
        }

        if (msgContent?.viewOnceMessageV2?.message) {
          msgContent = msgContent.viewOnceMessageV2.message;
        } else if (msgContent?.viewOnceMessage?.message) {
          msgContent = msgContent.viewOnceMessage.message;
        } else if (msgContent?.documentWithCaptionMessage?.message) {
          msgContent = msgContent.documentWithCaptionMessage.message;
        }

        // 🗑️ REVOCATION DETECTION: "Delete for Everyone"
        const proto = msgContent?.protocolMessage;
        if (
          proto &&
          (proto.type === 0 ||
            proto.type === "REVOKE" ||
            proto.type === "0" ||
            !proto.type) &&
          proto.key?.id
        ) {
          logger.info(
            `[SessionManager] 🗑️ Message revocation detected: ${proto.key.id} (by: ${msg.key.fromMe ? "me" : msg.key.remoteJid})`,
          );
          eventBus.publish({
            type: WhatsAppEventType.MESSAGE_REVOKED,
            sessionId,
            companyId,
            timestamp: new Date(),
            data: {
              revokedMessageId: proto.key.id,
              revokedBy: msg.key.remoteJid || "unknown",
              fromMe: msg.key.fromMe || false,
            },
          });
          continue; // Don't process as a normal message
        }

        // ❤️ REACTION DETECTION
        const react = msgContent?.reactionMessage;
        if (react && react.key?.id) {
          logger.info(
            `[SessionManager] ❤️ Reaction detected for ${react.key.id}: ${react.text}`,
          );
          eventBus.publish({
            type: WhatsAppEventType.MESSAGE_REACTION,
            sessionId,
            companyId,
            timestamp: new Date(),
            data: {
              messageId: react.key.id,
              reaction: react.text || "", // Empty if removed
              participant:
                msg.key.participant || msg.key.remoteJid || "unknown",
            },
          });
          continue; // Don't process as a normal message
        }

        eventBus.publish({
          type: WhatsAppEventType.MESSAGE_RECEIVED,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { message: msg as unknown as WAMessage },
        });
      }
    }
  });

  // Message status updates
  sock.ev.on("messages.update", async (rawUpdates: unknown) => {
    if (!Array.isArray(rawUpdates)) {
      logger.warn(
        `[SessionManager] ⚠️ messages.update received non-array payload for session ${sessionId}`,
      );
      return;
    }

    for (const rawUpdate of rawUpdates) {
      const validated = validateBaileysEvent(
        MessageUpdateSchema,
        rawUpdate,
        "messages.update",
        { sessionId, companyId },
      );
      if (!validated) continue;
      if (!validated.key?.id) continue;

      eventBus.publish({
        type: WhatsAppEventType.MESSAGE_UPDATE,
        sessionId,
        companyId,
        timestamp: new Date(),
        data: {
          messageId: validated.key.id,
          update: validated as unknown as WAMessageUpdate,
        },
      });
    }
  });

  // Presence updates (typing)
  sock.ev.on("presence.update", (rawData: unknown) => {
    const validated = validateBaileysEvent(
      PresenceUpdateSchema,
      rawData,
      "presence.update",
      { sessionId, companyId },
    );
    if (!validated) return;

    eventBus.publish({
      type: WhatsAppEventType.PRESENCE_UPDATE,
      sessionId,
      companyId,
      timestamp: new Date(),
      data: validated as WhatsAppEventData[WhatsAppEventType.PRESENCE_UPDATE],
    });
  });
}
