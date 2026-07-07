import { WAMessage, downloadMediaMessage, downloadContentFromMessage } from "@whiskeysockets/baileys";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

export class MediaDownloaderService {
  async downloadWithRetry(
    message: WAMessage,
    messageType: string,
    msgObj: Record<string, unknown> | undefined,
    messageId: string,
    sessionId?: string,
    getSession?: (id: string) => import("@whiskeysockets/baileys").WASocket | undefined,
  ): Promise<Buffer | null> {
    const MAX_RETRIES = 2;

    // Method 1: downloadMediaMessage with reuploadRequest for fresh keys
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        Logger.info(`[MediaDownloader] [ATTEMPT ${attempt}/${MAX_RETRIES}] downloadMediaMessage for ${messageId}`);
        const sock = sessionId && getSession ? getSession(sessionId) : undefined;
        const reuploadRequest = sock?.updateMediaMessage
          ? (msg: WAMessage) => sock.updateMediaMessage(msg)
          : undefined;
        const result = await downloadMediaMessage(
          message,
          "buffer",
          {},
          reuploadRequest
            ? { reuploadRequest, logger: undefined as unknown as import("pino").Logger }
            : undefined,
        );
        const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result as Uint8Array);
        if (buffer.length > 0) {
          Logger.info(`[MediaDownloader] [OK] Downloaded ${buffer.length} bytes via downloadMediaMessage`);
          return buffer;
        }
      } catch (err: unknown) {
        const errorMsg = (err instanceof Error) ? err.message : String(err);
        Logger.warn(`[MediaDownloader] [RETRY] downloadMediaMessage attempt ${attempt} failed: ${errorMsg}`);

        if (errorMsg.includes("bad decrypt") || errorMsg.includes("mac check failed")) {
            // [DOCS · Baileys 7] updateMediaMessage asks the LINKED PHONE (not WhatsApp's
            // CDN) to re-upload media it still has cached — there's no protocol-level
            // staleness limit on this, and it's precisely the mechanism historical/synced
            // messages need since their original CDN link is always long gone by the time
            // an agent looks at them. A message-age cutoff here previously aborted healing
            // for ANY message older than 2h — i.e. virtually every history-synced message,
            // making "retry download" permanently unable to recover old media. The circuit
            // breaker below is the correct guard against hammering (rate-limit backoff),
            // not message age.
            if (redisClient?.isOpen) {
                const isCircuitOpen = await redisClient.get(`cb:heal:${sessionId}`);
                if (isCircuitOpen) {
                     Logger.warn(`[MediaDownloader] [HEAL] Circuit breaker OPEN for ${sessionId}. Skipping updateMediaMessage.`);
                     break; 
                }
            }

            const sock = sessionId && getSession ? getSession(sessionId) : undefined;
            if (sock?.updateMediaMessage) {
                try {
                     Logger.info(`[MediaDownloader] [HEAL] Forcing WhatsApp server to issue fresh media keys for ${messageId}...`);
                     const freshMessage = await sock.updateMediaMessage(message);
                     message = freshMessage; 

                     if (message.message) {
                        const newContent = message.message as unknown as Record<string, unknown>;
                        let newMsgObj = newContent[messageType] as Record<string, unknown> | undefined;
                        if (messageType === "documentWithCaptionMessage") {
                            const innerMsg = newMsgObj?.message as Record<string, unknown> | undefined;
                            newMsgObj = (innerMsg?.documentMessage || newMsgObj) as Record<string, unknown> | undefined;
                        }
                        if (newMsgObj) msgObj = newMsgObj;
                     }
                     Logger.info(`[MediaDownloader] [HEAL] Keys completely refreshed. Ready for next attempt.`);
                } catch(healErr: unknown) {
                     const healErrorMsg = (healErr instanceof Error) ? healErr.message : String(healErr);
                     Logger.warn(`[MediaDownloader] [HEAL] updateMediaMessage failed: ${healErrorMsg}`);
                     
                     if (redisClient?.isOpen && (healErrorMsg.includes("Failed to re-upload media") || healErrorMsg.includes("rate-limit") || healErrorMsg.includes("timed out"))) {
                         Logger.error(`[MediaDownloader] [HEAL] Rate limit. Opening Circuit Breaker for session ${sessionId} for 10 minutes.`);
                         await redisClient.setEx(`cb:heal:${sessionId}`, 600, "1"); 
                     }
                }
            }
        }

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    try {
      Logger.info(`[MediaDownloader] [FALLBACK] Trying downloadContentFromMessage for ${messageId}`);
      const mappedStreamType = messageType.replace("Message", "");
      const streamType = (mappedStreamType === "documentWithCaption" ? "document" : mappedStreamType) as
        "image" | "video" | "audio" | "document" | "sticker";

      type DownloadableMsg = {
        mediaKey?: Uint8Array;
        directPath?: string;
        url?: string;
        mediaKeyTimestamp?: number;
      };

      const stream = await downloadContentFromMessage(
        msgObj as DownloadableMsg,
        streamType,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      const buffer = Buffer.concat(chunks);
      if (buffer.length > 0) {
        Logger.info(`[MediaDownloader] [OK] Downloaded ${buffer.length} bytes via downloadContentFromMessage`);
        return buffer;
      }
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error) ? err.message : String(err);
      Logger.error(`[MediaDownloader] [FINAL] All download methods failed for ${messageId}: ${errorMsg}`);
    }

    return null;
  }
}

export const mediaDownloaderService = new MediaDownloaderService();
