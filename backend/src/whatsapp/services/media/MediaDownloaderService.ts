import { WAMessage, downloadMediaMessage, downloadContentFromMessage } from "@whiskeysockets/baileys";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";
import { downloadMediaViaService } from "../../utils/whatsAppServiceHttp";

export class MediaDownloaderService {
  async downloadWithRetry(
    message: WAMessage,
    messageType: string,
    msgObj: Record<string, unknown> | undefined,
    messageId: string,
    companyId: string,
    sessionId?: string,
  ): Promise<Buffer | null> {
    const MAX_RETRIES = 2;

    // Method 1: direct downloadMediaMessage — works for fresh messages whose
    // CDN url/mediaKey are still valid (no socket needed for the download itself)
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        Logger.info(`[MediaDownloader] [ATTEMPT ${attempt}/${MAX_RETRIES}] downloadMediaMessage for ${messageId}`);
        const result = await downloadMediaMessage(message, "buffer", {});
        const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result as Uint8Array);
        if (buffer.length > 0) {
          Logger.info(`[MediaDownloader] [OK] Downloaded ${buffer.length} bytes via downloadMediaMessage`);
          return buffer;
        }
      } catch (err: unknown) {
        const errorMsg = (err instanceof Error) ? err.message : String(err);
        Logger.warn(`[MediaDownloader] [RETRY] downloadMediaMessage attempt ${attempt} failed: ${errorMsg}`);

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // Method 2: remote heal via whatsapp-service.
    // [DOCS · Baileys 7] updateMediaMessage asks the LINKED PHONE (not WhatsApp's
    // CDN) to re-upload media it still has cached — the official recovery for
    // expired/undecryptable media. The live socket only exists in whatsapp-service
    // since the microservice split, so the reupload+download runs there and we get
    // the bytes back over HTTP. The circuit breaker guards against hammering the
    // phone when it's rate-limiting reuploads.
    const cbKey = `cb:heal:${sessionId || companyId}`;
    if (redisClient?.isOpen) {
      const isCircuitOpen = await redisClient.get(cbKey);
      if (isCircuitOpen) {
        Logger.warn(`[MediaDownloader] [HEAL] Circuit breaker OPEN for ${sessionId || companyId}. Skipping remote heal.`);
        return this.fallbackDirectContent(messageType, msgObj, messageId);
      }
    }

    Logger.info(`[MediaDownloader] [HEAL] Requesting remote reupload+download via whatsapp-service for ${messageId}...`);
    const remoteBuffer = await downloadMediaViaService(companyId, message);
    if (remoteBuffer && remoteBuffer.length > 0) {
      Logger.info(`[MediaDownloader] [OK] Downloaded ${remoteBuffer.length} bytes via remote heal`);
      return remoteBuffer;
    }

    if (redisClient?.isOpen) {
      // Remote heal failed — likely phone offline or reupload rate-limit. Back off
      // for 10 minutes so a burst of media messages can't hammer the phone.
      Logger.warn(`[MediaDownloader] [HEAL] Remote heal failed. Opening circuit breaker for ${sessionId || companyId} for 10 minutes.`);
      await redisClient.setEx(cbKey, 600, "1");
    }

    return this.fallbackDirectContent(messageType, msgObj, messageId);
  }

  // Method 3 (last resort): raw downloadContentFromMessage against the CDN with
  // whatever url/mediaKey the message still carries.
  private async fallbackDirectContent(
    messageType: string,
    msgObj: Record<string, unknown> | undefined,
    messageId: string,
  ): Promise<Buffer | null> {
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
