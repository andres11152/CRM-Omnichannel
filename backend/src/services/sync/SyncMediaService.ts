import { WAMessage, downloadMediaMessage, getContentType } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { storageService } from "@/services/storageService";
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
      Logger.error(`[SyncMedia] ⚠️ Media healing failed for ${whatsappMessageId}`, {
        companyId,
        whatsappMessageId,
        error: healErr instanceof Error ? healErr.message : String(healErr),
        stack: healErr instanceof Error ? healErr.stack : undefined
      });
    }
  }

  /**
   * 📥 DOWNLOAD AND UPLOAD MEDIA
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
        Logger.error(`[SyncMedia] ⚠️ Download failed for ${whatsappMessageId} (${mediaType})`, {
          companyId,
          whatsappMessageId,
          mediaType,
          errorDl: dlErr instanceof Error ? dlErr.message : String(dlErr),
          errorBuf: bufErr instanceof Error ? bufErr.message : String(bufErr),
          stack: bufErr instanceof Error ? bufErr.stack : undefined
        });
      }
    }

    return { url: undefined, mimetype: rawMime };
  }
}

export const syncMediaService = new SyncMediaService();
