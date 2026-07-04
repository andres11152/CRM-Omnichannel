import { WAMessage, downloadMediaMessage, getContentType, BufferJSON } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { storageService } from "@/services/StorageService";
import { Readable } from "stream";
import mime from "mime-types";
import { messageRepository } from "@/repositories/MessageRepository";
import { Prisma } from "@prisma/client";

/** Context that lets Baileys re-request expired media from the phone (reuploadRequest). */
type MediaCtx = {
  reuploadRequest: (m: WAMessage) => Promise<WAMessage>;
  logger: unknown;
};

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

    const { syncMessageParser } = await import("./SyncMessageParser");
    const msgContent = syncMessageParser.unwrapContent(msg) as Record<string, unknown> | undefined;
    if (!msgContent) return;

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
    msgContent: Record<string, unknown>, // Baileys message content can be highly variable
    // [DOCS · Baileys] Pass the session's updateMediaMessage as reuploadRequest so media
    // whose CDN URL expired (always the case for history) is re-requested from the phone.
    mediaCtx?: MediaCtx,
  }) {
    const { companyId, whatsappMessageId, msg, mediaType, msgContent, mediaCtx } = params;
    const mediaProp = mediaType === "audio" ? "audioMessage" : mediaType + "Message";
    const msgObj = msgContent && (msgContent[mediaProp as keyof typeof msgContent] as Prisma.JsonObject | undefined);
    const rawMime = (msgObj?.mimetype as string | undefined) || "application/octet-stream";
    const ctx = mediaCtx as unknown as Parameters<typeof downloadMediaMessage>[3];

    try {
      // PRIMARY: Try stream
      const stream = await downloadMediaMessage(msg, "stream", {}, ctx);
      if (stream) {
        const ext = mime.extension(rawMime) || "bin";
        const filename = `sync_${whatsappMessageId}.${ext}`;
        const uploadResult = await storageService.uploadStream(companyId, stream as Readable, filename, rawMime);
        return { url: uploadResult.url, mimetype: rawMime };
      }
    } catch (dlErr: unknown) {
      // FALLBACK: Try buffer
      try {
        const buffer = await downloadMediaMessage(msg, "buffer", {}, ctx);
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

  /**
   * ON-DEMAND MEDIA RETRY
   * Tries to fetch the raw message from the memory/Redis store and redownload the media.
   */
  async retryMedia(companyId: string, messageId: string) {
    const { messageRepository } = await import("@/repositories/MessageRepository");
    const { whatsappService } = await import("@/whatsapp/WhatsAppService");

    const message = await messageRepository.findFirst({
      where: { id: messageId, companyId },
    });

    if (!message || !message.whatsappMessageId) {
      throw new Error("Mensaje no encontrado o sin ID de WhatsApp asociado.");
    }

    const meta = message.metadata as Prisma.JsonObject | null;
    const mediaObj = meta?.media as Prisma.JsonObject | undefined;
    
    if (!mediaObj) {
      throw new Error("El mensaje no contiene información multimedia.");
    }

    const activeSession = await whatsappService.getSessionManager().findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error("No hay una sesión de WhatsApp activa para esta empresa.");
    }

    const store = whatsappService.getSessionStore(activeSession.sessionId);
    if (!store) {
      throw new Error("El almacén de sesión no está disponible.");
    }

    // 1. Try the in-memory Baileys store (recent live messages)
    let rawMsg: WAMessage | undefined;
    for (const jid in store.messages) {
      const msgs = store.messages[jid];
      // Baileys 7: store holds proto.IWebMessageInfo (key optional). We only keep entries
      // that actually carry a key, so the cast to WAMessage is safe.
      rawMsg = msgs.find((m) => m.key?.id === message.whatsappMessageId) as WAMessage | undefined;
      if (rawMsg) break;
    }

    // 2. Fallback: rebuild from the raw proto we persisted during history ingest (_raw),
    //    so history media works even when the message left the in-memory store.
    if (!rawMsg) {
      const rawSerialized = mediaObj._raw as string | undefined;
      if (rawSerialized) {
        try {
          rawMsg = JSON.parse(rawSerialized, BufferJSON.reviver) as WAMessage;
        } catch (e) {
          Logger.warn(`[MediaRetry] Failed to parse persisted _raw for ${messageId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    if (!rawMsg || !rawMsg.message) {
      throw new Error("El mensaje es muy antiguo y ya no está disponible para descargar. Sincroniza de nuevo.");
    }

    // Attempt to download and upload again
    const mediaType = (meta.mediaType as string) || "document";
    const { syncMessageParser } = await import("./SyncMessageParser");
    const msgContent = syncMessageParser.unwrapContent(rawMsg) as Record<string, unknown> | undefined;

    if (!msgContent || Object.keys(msgContent).length === 0) {
      throw new Error("El mensaje crudo no tiene contenido.");
    }

    // [DOCS · Baileys 7] reuploadRequest = sock.updateMediaMessage: asks the phone to
    // re-upload the media so we can download it even when the original CDN link is gone
    // (the normal case for history images). Without this, retries always failed.
    const sock = activeSession.socket as unknown as {
      updateMediaMessage: (m: WAMessage) => Promise<WAMessage>;
      logger: unknown;
    };
    const mediaCtx: MediaCtx = {
      reuploadRequest: (m: WAMessage) => sock.updateMediaMessage(m),
      logger: sock.logger,
    };

    const result = await this.downloadAndUpload({
      companyId,
      whatsappMessageId: message.whatsappMessageId,
      msg: rawMsg,
      mediaType,
      msgContent,
      mediaCtx,
    });

    if (!result.url) {
      throw new Error("Falló la descarga. Es posible que el archivo haya expirado en los servidores de WhatsApp.");
    }

    // Update DB
    const updatedMedia = { ...mediaObj, type: mediaType, url: result.url };
    const updatedMeta = { ...meta, media: updatedMedia };

    const updatedMessage = await messageRepository.update(message.id, {
      metadata: updatedMeta as Prisma.InputJsonValue,
    });

    Logger.info(`[MediaRetry] Successfully recovered media for message ${messageId}: ${result.url}`);

    return {
      success: true,
      url: result.url,
      message: updatedMessage
    };
  }
}

export const syncMediaService = new SyncMediaService();
