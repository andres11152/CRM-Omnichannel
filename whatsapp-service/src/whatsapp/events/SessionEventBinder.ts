import {
  WASocket,
  DisconnectReason,
  WAMessage,
  WAMessageUpdate,
  proto,
} from "@whiskeysockets/baileys";
import { EventBus } from "./EventBus";
import {
  WhatsAppEventType,
  WhatsAppEventData,
} from "./WhatsAppEvents";
import { ConnectionHealer } from "../ConnectionHealer";
import { Logger } from "../../utils/logger";
import {
  ConnectionUpdateSchema,
  MessagesUpsertSchema,
  MessageUpdateSchema,
  PresenceUpdateSchema,
  CallEventBatchSchema,
  HistorySyncSchema,
  validateBaileysEvent,
} from "../baileys.schemas";
import { prisma } from "../../config/database";
import { getInboundQueue, getHistorySyncQueue } from "../../config/queues";
import { antiBanManager, classifyDisconnect } from "../AntiBanManager";
import type { SessionStatus } from "../types";
import type { SimpleInMemoryStore } from "../SimpleStore";

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

function serializeForQueue(message: proto.IWebMessageInfo): string {
  const encoded = proto.WebMessageInfo.encode(
    proto.WebMessageInfo.create(message),
  ).finish();
  return Buffer.from(encoded).toString("base64");
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

  store.bind(sock.ev);

  sock.ev.on("contacts.update", async (updates) => {
    for (const update of updates) {
      if (!update.id) continue;

      let imgUrl = update.imgUrl;
      if (imgUrl === "changed") {
        try {
          imgUrl = await sock.profilePictureUrl(update.id, "image", 15000);
        } catch {
          try {
            imgUrl = await sock.profilePictureUrl(update.id, "preview", 15000);
          } catch {
            imgUrl = undefined;
          }
        }
      }
      
      eventBus.publish({
        type: WhatsAppEventType.CONTACT_UPDATED,
        sessionId,
        companyId,
        timestamp: new Date(),
        data: { contact: { ...update, imgUrl } as import("@whiskeysockets/baileys").Contact },
      });
    }
  });

  sock.ev.on("messaging-history.set", (rawData: unknown) => {
    const validated = validateBaileysEvent(
      HistorySyncSchema,
      rawData,
      "messaging-history.set",
      { sessionId, companyId },
    );
    if (!validated) return;

    Logger.info(`[SessionEventBinder] Ingesting history sync batch to BullMQ queue for company ${companyId}`);
    
    getHistorySyncQueue()?.add("process-history-sync", {
      companyId,
      sessionId,
      messages: validated.messages,
      chats: validated.chats,
      contacts: validated.contacts,
      isLatest: validated.isLatest,
      syncType: validated.syncType,
      progress: validated.progress,
    }).catch((err) => {
      Logger.error(err, `[SessionEventBinder] Failed to enqueue history sync to BullMQ:`);
    });
  });

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
        Logger.info(`[SessionEventBinder] Ignoring QR code generation for session ${sessionId} because it is in phone pairing mode.`);
      } else {
        eventBus.publish({
          type: WhatsAppEventType.SESSION_QR_CODE,
          sessionId,
          companyId,
          timestamp: new Date(),
          data: { qr },
        });

        await prisma.whatsAppSession.update({
          where: { sessionId },
          data: {
            qrCode: qr,
            status: "SCANNING",
            phone: null,
          },
        }).catch(async (err) => {
          Logger.warn(`[SessionEventBinder] QR update failed in DB: ${err.message}`);
        });
      }
    }

    if (connection === "open") {
      let phoneNumber: string | null = null;
      if (sock.user?.id) {
        phoneNumber = sock.user.id.split(":")[0].split("@")[0];
      }

      Logger.info(`[SessionManager] Session ${sessionId} CONNECTED [OK] Phone: ${phoneNumber || "Unknown"}`);
      
      sessionMetadata.set(sessionId, { companyId, status: "CONNECTED", isPairing: false });

      await prisma.whatsAppSession.update({
        where: { sessionId },
        data: {
          qrCode: null,
          status: "CONNECTED",
          phone: phoneNumber,
        },
      }).catch(async (err) => {
        Logger.error(`[SessionEventBinder] Connection open DB update failed: ${err.message}`);
      });

      eventBus.publish({
        type: WhatsAppEventType.SESSION_CONNECTED,
        sessionId,
        companyId,
        timestamp: new Date(),
        data: { phone: phoneNumber || undefined },
      });

      antiBanManager.notifyReconnect(sessionId);
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

      const classification = classifyDisconnect(statusCode);
      Logger.warn(
        `[SessionManager] Session ${sessionId} CLOSED. Reason: ${errorMsg} | ` +
        `Category: ${classification.category} | ShouldReconnect: ${classification.shouldReconnect}`
      );

      antiBanManager.stopEntropy(sessionId);
      antiBanManager.notifyDisconnect(sessionId, statusCode || errorMsg);

      try { sock.end(undefined); } catch { /* ignore */ }
      
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
          Logger.warn(`[SessionEventBinder] LoggedOut attempts exhausted for session ${sessionId}. Performing soft-disconnect.`);
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

  const dispatchRealtimeMessage = (msg: (typeof MessagesUpsertSchema._type)["messages"][number]) => {
    if (!msg.message) return;
    let msgContent = msg.message as Record<string, unknown>;

    if (msgContent["ephemeralMessage"]) {
      const eph = msgContent["ephemeralMessage"] as Record<string, unknown>;
      if (eph["message"]) msgContent = eph["message"] as Record<string, unknown>;
    }
    if (msgContent["viewOnceMessageV2"]) {
      const v2 = msgContent["viewOnceMessageV2"] as Record<string, unknown>;
      if (v2["message"]) msgContent = v2["message"] as Record<string, unknown>;
    }

    const protoMsg = msgContent["protocolMessage"] as Record<string, unknown> | undefined;
    if (protoMsg) {
      const protoType = protoMsg["type"];
      const protoKey = protoMsg["key"] as Record<string, unknown> | undefined;
      if ((protoType === 0 || protoType === "REVOKE" || !protoType) && protoKey?.["id"]) {
        eventBus.publish({
          type: WhatsAppEventType.MESSAGE_REVOKED,
          sessionId, companyId, timestamp: new Date(),
          data: { revokedMessageId: String(protoKey["id"]), revokedBy: msg.key.remoteJid || "unknown", fromMe: msg.key.fromMe || false },
        });
      } else if ((protoType === 14 || protoType === "MESSAGE_EDIT") && protoKey?.["id"] && protoMsg["editedMessage"]) {
        eventBus.publish({
          type: WhatsAppEventType.MESSAGE_EDITED,
          sessionId, companyId, timestamp: new Date(),
          data: {
            originalMessageId: String(protoKey["id"]),
            editedMessage: protoMsg["editedMessage"] as import("@whiskeysockets/baileys").proto.IMessage,
          },
        });
      }
      return;
    }

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

    // Inbound: serialize and enqueue into BullMQ whatsapp-inbound
    const msgId = msg.key?.id;
    try {
      const encodedMessage = serializeForQueue(msg as unknown as WAMessage);
      const jobId = msgId
        ? `${sessionId}_${msgId}`.replace(/[^A-Za-z0-9_-]/g, "")
        : undefined;

      // [SEC] LID resolution: Baileys attaches `remoteJidAlt`/`addressingMode` to
      // WAMessageKey in-process from its own LID store (see WAMessageKey type —
      // it's `proto.IMessageKey & { remoteJidAlt?: string; ... }`, an intersection
      // ON TOP of the actual protobuf schema). These are NOT real protobuf fields,
      // so proto.WebMessageInfo.encode() silently drops them — the backend's
      // decode() never sees them, breaking IdentityResolverService's primary LID
      // resolution strategy for every message that crosses this queue. Carry them
      // as plain JSON alongside the protobuf blob instead.
      const keyExtras = msg.key
        ? {
            remoteJidAlt: (msg.key as Record<string, unknown>).remoteJidAlt as string | undefined,
            addressingMode: (msg.key as Record<string, unknown>).addressingMode as string | undefined,
          }
        : undefined;

      getInboundQueue()?.add(
        "process-message",
        { encodedMessage, sessionId, companyId, keyExtras },
        { jobId }
      ).then((job) => {
        Logger.info(`[SessionEventBinder] Inbound ${msgId} → enqueued to 'whatsapp-inbound' (job ${job.id})`);
      });
    } catch (queueErr) {
      Logger.error(queueErr, `[SessionEventBinder] BullMQ enqueue failed for ${msgId}:`);
    }
  };

  sock.ev.on("messages.upsert", async (rawData: unknown) => {
    const validated = validateBaileysEvent(MessagesUpsertSchema, rawData, "messages.upsert", { sessionId, companyId });
    if (!validated) return;

    if (validated.type === "notify") {
      const ab = antiBanManager.getSession(sessionId);
      for (const msg of validated.messages) {
        if (msg.key.fromMe && msg.key.id) {
          ab?.deliveryTracker.onMessageSent(msg.key.id);
        }
        dispatchRealtimeMessage(msg);
      }
    } else if (validated.type === "append") {
      const REALTIME_WINDOW_SECONDS = 120;
      const nowSeconds = Date.now() / 1000;

      const realtimeMsgs: typeof validated.messages = [];
      const historyMsgs: typeof validated.messages = [];

      for (const msg of validated.messages) {
        const ts = typeof msg.messageTimestamp === "number" 
          ? msg.messageTimestamp 
          : typeof msg.messageTimestamp === "string" 
            ? Number(msg.messageTimestamp) 
            : msg.messageTimestamp && typeof (msg.messageTimestamp as { toNumber?: () => number }).toNumber === "function"
              ? (msg.messageTimestamp as { toNumber: () => number }).toNumber()
              : 0;

        const isFresh = ts > 0 && nowSeconds - ts < REALTIME_WINDOW_SECONDS;
        if (isFresh && msg.message) {
          realtimeMsgs.push(msg);
        } else {
          historyMsgs.push(msg);
        }
      }

      if (realtimeMsgs.length > 0) {
        for (const msg of realtimeMsgs) {
          dispatchRealtimeMessage(msg);
        }
      }

      if (historyMsgs.length > 0) {
        Logger.info(`[SessionEventBinder] Routing ${historyMsgs.length} history sync append messages to BullMQ`);
        getHistorySyncQueue()?.add("process-history-sync", {
          companyId,
          sessionId,
          messages: historyMsgs,
        }).catch((err) => {
          Logger.error(err, `[SessionEventBinder] Failed to enqueue history append to BullMQ:`);
        });
      }
    }
  });

  sock.ev.on("messages.update", async (rawUpdates: unknown) => {
    if (Array.isArray(rawUpdates)) {
      const ab = antiBanManager.getSession(sessionId);
      for (const rawUpdate of rawUpdates) {
        const stubType = (rawUpdate as Record<string, unknown>)?.update as Record<string, unknown> | undefined;
        if (
          stubType?.messageStubType === 0 // CIPHERTEXT is often 0 or string
        ) {
          ab?.healthMonitor.recordDecryptFail(true);
        }

        const validated = validateBaileysEvent(MessageUpdateSchema, rawUpdate, "messages.update", { sessionId, companyId });
        if (validated && validated.key?.id) {
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

  sock.ev.on("call", (rawEvents: unknown) => {
    const validated = validateBaileysEvent(CallEventBatchSchema, rawEvents, "call", { sessionId, companyId });
    if (!validated) return;

    for (const call of validated) {
      if (call.status !== "offer") continue;

      Logger.info(`[Call] Incoming call from ${call.from} — auto-rejecting`);

      sock.rejectCall(call.id, call.from).catch((err) => {
        Logger.warn(`[Call] Failed to reject call ${call.id} from ${call.from}: ${err.message}`);
      });

      eventBus.publish({
        type: WhatsAppEventType.CALL_RECEIVED,
        sessionId, companyId, timestamp: new Date(),
        data: { callId: call.id, from: call.from, isVideo: !!call.isVideo, isGroup: !!call.isGroup },
      });
    }
  });

  sock.ev.on("creds.update", saveCreds);
}
