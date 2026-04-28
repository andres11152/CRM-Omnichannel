import { WAMessage, downloadMediaMessage, getContentType } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { storageService } from "@/services/StorageService";
import { Readable } from "stream";
import mime from "mime-types";
import { messageRepository } from "@/repositories/MessageRepository";
import { Prisma } from "@prisma/client";

export class SyncMediaService {
  /**
   * 🩹 MEDIA HEALING
   * If a message has unavailable media (expired keys), attempts to download it.
   */
  async healMedia(companyId: string, whatsappMessageId: string, msg: WAMessage, existing: { id: string, metadata: Prisma.JsonValue }) {
    const existingMeta = existing.metadata as Prisma.JsonObject | null;
    const existingMedia = existingMeta?.media as Prisma.JsonObject | undefined;
    const existingMediaType = (existingMedia?.type as string) || "";

    if (!existingMedia || !existingMediaType.endsWith("_unavailable")) return;

    const messageType = msg.message ? getContentType(msg.message) : undefined;
    if (!messageType) return;

    let msgContent = msg.message || {};
    // Unwrap nested messages
    if ("ephemeralMessage" in msgContent && msgContent.ephemeralMessage?.message) {
      msgContent = msgContent.ephemeralMessage.message;
    }
    if ("viewOnceMessageV2" in msgContent && msgContent.viewOnceMessageV2?.message) {
      msgContent = msgContent.viewOnceMessageV2.message;
    } else if ("viewOnceMessage" in msgContent && msgContent.viewOnceMessage?.message) {
      msgContent = msgContent.viewOnceMessage.message;
    } else if ("documentWithCaptionMessage" in msgContent && msgContent.documentWithCaptionMessage?.message) {
      msgContent = msgContent.documentWithCaptionMessage.message;
    }

    const baseType = existingMediaType.replace("_unavailable", "");
    const mediaProp = baseType === "audio" ? "audioMessage" : baseType + "Message";
    const msgObj = msgContent && (msgContent[mediaProp as keyof typeof msgContent] as Prisma.JsonObject | undefined);
    const rawMime = (msgObj?.mimetype as string | undefined) || "application/octet-stream";

    try {
      let healedUrl: string | undefined;

      // Try stream first, then buffer
      try {
        const stream = await downloadMediaMessage(msg, "stream", {});
        if (stream) {
          const ext = mime.extension(rawMime) || "bin";
          const filename = `sync_${whatsappMessageId}.${ext}`;
          const uploadResult = await storageService.uploadStream(companyId, stream as Readable, filename, rawMime);
          healedUrl = uploadResult.url;
        }
      } catch {
        const buffer = await downloadMediaMessage(msg, "buffer", {});
        if (buffer && buffer.length > 0) {
          const ext = mime.extension(rawMime) || "bin";
          const filename = `sync_${whatsappMessageId}.${ext}`;
          const bufferStream = Readable.from(buffer);
          const uploadResult = await storageService.uploadStream(companyId, bufferStream, filename, rawMime);
          healedUrl = uploadResult.url;
        }
      }

      if (healedUrl) {
        const updatedMedia = { ...existingMedia, type: baseType, url: healedUrl };
        const updatedMeta = { ...existingMeta, media: updatedMedia };

        await messageRepository.update(existing.id, {
          metadata: updatedMeta as Prisma.InputJsonValue,
        });

        Logger.info(`[SyncMedia] 🩹 HEALED media for ${whatsappMessageId} (${baseType}): ${healedUrl}`);
      }
    } catch (healErr: unknown) {
      // [SEC] ENTERPRISE FIX: WhatsApp CDN URLs expire after ~2 weeks.
      // Historical messages from history sync will ALWAYS fail with 403/410/404.
      // These are expected and should NOT spam the error log.
      const errMsg = healErr instanceof Error ? healErr.message : String(healErr);
      const isExpiredMedia = errMsg.includes("403") || errMsg.includes("410") || errMsg.includes("404");

      if (isExpiredMedia) {
        Logger.debug(`[SyncMedia] [EXPIRED] Media CDN expired for ${whatsappMessageId} (${baseType}). Skipping heal.`);
      } else {
        Logger.error(`[SyncMedia] [WARNING] Media healing failed for ${whatsappMessageId}`, {
          companyId,
          whatsappMessageId,
          error: errMsg,
          stack: healErr instanceof Error ? healErr.stack : undefined
        });
      }
    }
  }

  /**
   *  DOWNLOAD AND UPLOAD MEDIA
   * Downloads media from WhatsApp servers and uploads it to our storage provider.
   */
  async downloadAndUpload(params: {
    companyId: string,
    whatsappMessageId: string,
    msg: WAMessage,
    mediaType: string,
    msgContent: Record<string, unknown> // Baileys message content can be highly variable
  }) {
    const { companyId, whatsappMessageId, msg, mediaType, msgContent } = params;
    const mediaProp = mediaType === "audio" ? "audioMessage" : mediaType + "Message";
    const msgObj = msgContent && (msgContent[mediaProp as keyof typeof msgContent] as Prisma.JsonObject | undefined);
    const rawMime = (msgObj?.mimetype as string | undefined) || "application/octet-stream";

    try {
      // PRIMARY: Try stream
      const stream = await downloadMediaMessage(msg, "stream", {});
      if (stream) {
        const ext = mime.extension(rawMime) || "bin";
        const filename = `sync_${whatsappMessageId}.${ext}`;
        const uploadResult = await storageService.uploadStream(companyId, stream as Readable, filename, rawMime);
        return { url: uploadResult.url, mimetype: rawMime };
      }
    } catch (dlErr: unknown) {
      // FALLBACK: Try buffer
      try {
        const buffer = await downloadMediaMessage(msg, "buffer", {});
        if (buffer && buffer.length > 0) {
          const ext = mime.extension(rawMime) || "bin";
          const filename = `sync_${whatsappMessageId}.${ext}`;
          const bufferStream = Readable.from(buffer);
          const uploadResult = await storageService.uploadStream(companyId, bufferStream, filename, rawMime);
          return { url: uploadResult.url, mimetype: rawMime };
        }
      } catch (bufErr: unknown) {
        const errorDl = dlErr instanceof Error ? dlErr.message : String(dlErr);
        const errorBuf = bufErr instanceof Error ? bufErr.message : String(bufErr);
        const isExpired = 
          errorDl.includes("403") || errorDl.includes("410") || errorDl.includes("404") ||
          errorBuf.includes("403") || errorBuf.includes("410") || errorBuf.includes("404");

        if (isExpired) {
          Logger.debug(`[SyncMedia] [EXPIRED] ${whatsappMessageId} (${mediaType}) no longer on WA servers.`);
        } else {
          Logger.debug(`[SyncMedia] [FAILED] ${whatsappMessageId} (${mediaType}): ${errorBuf}`);
        }
      }
    }

    return { url: undefined, mimetype: rawMime };
  }
}

export const syncMediaService = new SyncMediaService();
