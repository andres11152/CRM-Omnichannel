import { Worker, Job, UnrecoverableError } from "bullmq";
import IORedis from "ioredis";
import { Logger } from "../utils/logger";
import { sessionManager } from "../whatsapp";
import OutboundJidResolver from "../whatsapp/OutboundJidResolver";
import { getOutboundCallbackQueue, getRedisConnection } from "../config/queues";
import { MediaPayload, SendMessageOptions } from "../whatsapp/types";
import { generateMessageID } from "@whiskeysockets/baileys";

interface OutboundJobData {
  type: "text" | "media";
  payload: {
    to: string;
    content?: string;
    media?: MediaPayload;
    options: SendMessageOptions & {
      dbId?: string;
      quoted?: import("@whiskeysockets/baileys").proto.IWebMessageInfo;
      generatedMessageId?: string;
    };
  };
}

export class OutboundWorker {
  private worker: Worker;
  private jidResolver: OutboundJidResolver;

  constructor() {
    this.jidResolver = new OutboundJidResolver(sessionManager);
    const redis = getRedisConnection();

    if (!redis) {
      throw new Error("[OutboundWorker] Redis connection not initialized.");
    }

    this.worker = new Worker(
      "whatsapp-outbound",
      async (job: Job) => {
        const { type, payload } = job.data as OutboundJobData;
        const companyId = payload.options.companyId;
        const dbMessageId = payload.options.dbId;

        try {
          Logger.info(`[OutboundWorker] Sending ${type} message to ${payload.to} (DB ID: ${dbMessageId})`);

          // 1. Resolve session
          const activeSession = await sessionManager.findActiveSessionForCompany(companyId);
          if (!activeSession) {
            throw new Error(`No active WhatsApp session for company: ${companyId}`);
          }
          const { sessionId, socket: sock } = activeSession;

          // 2. Resolve destination Jid
          const jid = await this.jidResolver.resolveDestinationJid(payload.to, companyId, sessionId);

          const quotedMsg = (payload.options.quoted as unknown as import("@whiskeysockets/baileys").WAMessage) || undefined;

          // 4. Generate Message ID
          const generatedId = payload.options.generatedMessageId || generateMessageID();

          // 5. Ensure Group Metadata
          if (jid.endsWith("@g.us")) {
            try {
              await sock.groupMetadata(jid);
            } catch (err) {
              Logger.warn(`[OutboundWorker] Failed to fetch group metadata for ${jid} before sending: ${err.message}`);
            }
          }

          // 6. Build content payload
          let messageContent: import("@whiskeysockets/baileys").AnyMessageContent;
          if (type === "text" && payload.content) {
            messageContent = { text: payload.content };
          } else if (type === "media" && payload.media) {
            const m = payload.media;
            const urlSource = m.url ? { url: m.url } : undefined;
            
            if (m.type === "image") {
              messageContent = { image: urlSource, caption: m.caption, mimetype: m.mimetype };
            } else if (m.type === "video") {
              messageContent = { video: urlSource, caption: m.caption, mimetype: m.mimetype };
            } else if (m.type === "audio") {
              messageContent = { audio: urlSource, mimetype: m.mimetype, ptt: true };
            } else if (m.type === "document") {
              messageContent = { document: urlSource, mimetype: m.mimetype, fileName: m.filename, caption: m.caption };
            } else if (m.type === "sticker") {
              messageContent = { sticker: urlSource };
            } else if (m.type === "location" && m.location) {
              messageContent = {
                location: {
                  degreesLatitude: m.location.latitude,
                  degreesLongitude: m.location.longitude,
                  name: m.location.name,
                  address: m.location.address,
                },
              };
            } else if (m.type === "contact" && m.contact) {
              messageContent = {
                contacts: {
                  displayName: m.contact.name,
                  contacts: [{
                    displayName: m.contact.name,
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${m.contact.name}\nTEL;type=CELL;type=VOICE;waid=${m.contact.phone.replace("+", "")}:${m.contact.phone}\nEND:VCARD`,
                  }],
                },
              };
            } else {
              throw new Error(`Unsupported media type: ${m.type}`);
            }
          } else {
            throw new Error(`Invalid job type/payload`);
          }

          // 7. Dispatch message via Baileys
          const sentMsg = await sock.sendMessage(jid, messageContent, {
            messageId: generatedId,
            quoted: quotedMsg,
          });

          const resultMessageId = sentMsg?.key?.id || generatedId;
          Logger.info(`[OutboundWorker] Message sent successfully to ${payload.to} (WA ID: ${resultMessageId})`);

          // 8. Enqueue SUCCESS callback
          await getOutboundCallbackQueue()?.add("callback", {
            success: true,
            companyId,
            sessionId,
            messageId: resultMessageId,
            dbMessageId,
            to: payload.to,
          });

          return { success: true, messageId: resultMessageId };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          Logger.error(`[OutboundWorker] Failed to send message to ${payload.to}: ${errMsg}`);

          // Enqueue FAILURE callback
          await getOutboundCallbackQueue()?.add("callback", {
            success: false,
            companyId,
            error: errMsg,
            dbMessageId,
            to: payload.to,
          });

          // Check if error is unrecoverable (fatal)
          const FATAL_PATTERNS = [
            "not on whatsapp",
            "not-on-whatsapp",
            "invalid phone",
            "invalid number",
            "bad jid",
            "recipient is not on whatsapp",
          ];
          if (FATAL_PATTERNS.some((p) => errMsg.toLowerCase().includes(p))) {
            throw new UnrecoverableError(errMsg);
          }

          throw error;
        }
      },
      {
        connection: redis,
        // Fixed at 1: a company's messages must dispatch through one WhatsApp
        // socket in send order. Concurrent workers can resolve JID/media async
        // work out of enqueue order and dispatch to WhatsApp out of order —
        // there's no per-company FIFO guarantee to fall back on otherwise.
        concurrency: 1,
      }
    );

    this.worker.on("ready", () => {
      Logger.info("[OutboundWorker] Ready and listening for outbound jobs");
    });
  }
}
export default OutboundWorker;
