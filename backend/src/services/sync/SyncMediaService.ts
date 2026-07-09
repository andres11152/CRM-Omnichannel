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
  // Serial background chain for post-sync media hydration. One conversation's
  // media downloads run at a time (each download already round-trips to the
  // linked phone via reuploadRequest), so bursts of history batches can never
  // stampede the phone or the event loop.
  private hydrationChain: Promise<void> = Promise.resolve();
  private hydratingConversations = new Set<string>();

  /**
   * 🩹 POST-SYNC MEDIA HYDRATION (background)
   *
   * History ingest deliberately persists media as `<type>_unavailable` + `_raw`
   * (downloading inline would block the event loop for the whole batch). Before
   * this, media stayed "no disponible" until the agent clicked "Reintentar
   * Descarga" on EVERY message. This schedules the same recovery the retry
   * button performs (downloadMediaMessage + official updateMediaMessage
   * healing) automatically for the newest N media messages of the conversation,
   * then notifies the frontend so the chat re-renders with real media.
   */
  scheduleHydration(companyId: string, conversationId: string, limit = 15): void {
    const key = `${companyId}:${conversationId}`;
    if (this.hydratingConversations.has(key)) return;
    this.hydratingConversations.add(key);

    this.hydrationChain = this.hydrationChain
      .catch(() => {})
      .then(async () => {
        try {
          const healed = await this.hydrateConversationMedia(companyId, conversationId, limit);
          if (healed > 0) {
            const { gateway } = await import("@/gateways/socketGateway");
            gateway.emitToCompany(companyId, "conversation:history_synced", {
              conversationId,
              newMessages: 0,
              mediaHydrated: healed,
            });
          }
        } catch (err) {
          Logger.warn(
            `[SyncMedia] Background hydration failed for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          this.hydratingConversations.delete(key);
        }
      });
  }

  /**
   * Downloads pending `_unavailable` media for a conversation (newest first).
   * Returns how many messages were healed.
   */
  async hydrateConversationMedia(companyId: string, conversationId: string, limit: number): Promise<number> {
    const { whatsappService } = await import("@/whatsapp/WhatsAppService");
    const { syncMessageParser } = await import("./SyncMessageParser");

    const activeSession = await whatsappService.getSessionManager().findActiveSessionForCompany(companyId);
    if (!activeSession) return 0;

    const sock = activeSession.socket as unknown as {
      updateMediaMessage: (m: WAMessage) => Promise<WAMessage>;
      logger: unknown;
    };
    const mediaCtx: MediaCtx = {
      reuploadRequest: (m: WAMessage) => sock.updateMediaMessage(m),
      logger: sock.logger,
    };

    const pending = await messageRepository.findMany({
      where: {
        companyId,
        conversationId,
        metadata: { path: ["media", "type"], string_ends_with: "_unavailable" },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, whatsappMessageId: true, metadata: true },
    });

    if (pending.length === 0) return 0;
    Logger.info(`[SyncMedia] Hydrating ${pending.length} pending media for conversation ${conversationId}`);

    let healed = 0;
    for (const message of pending) {
      const meta = message.metadata as Prisma.JsonObject | null;
      const mediaObj = meta?.media as Prisma.JsonObject | undefined;
      const rawSerialized = mediaObj?._raw as string | undefined;
      if (!rawSerialized || !message.whatsappMessageId) continue;

      try {
        const rawMsg = JSON.parse(rawSerialized, BufferJSON.reviver) as WAMessage;
        if (!rawMsg?.message) continue;

        const mediaType = (meta?.mediaType as string) || "document";
        const msgContent = syncMessageParser.unwrapContent(rawMsg) as Record<string, unknown> | undefined;
        if (!msgContent) continue;

        const result = await this.downloadAndUpload({
          companyId,
          whatsappMessageId: message.whatsappMessageId,
          msg: rawMsg,
          mediaType,
          msgContent,
          mediaCtx,
        });

        if (result.url) {
          const updatedMedia = { ...mediaObj, type: mediaType, url: result.url, mimetype: result.mimetype };
          await messageRepository.update(message.id, {
            metadata: { ...meta, media: updatedMedia } as Prisma.InputJsonValue,
          });
          healed++;
        }
      } catch (err) {
        Logger.debug(
          `[SyncMedia] Hydration skip for ${message.whatsappMessageId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Gentle pacing between phone round-trips
      await new Promise((r) => setTimeout(r, 250));
    }

    if (healed > 0) {
      Logger.info(`[SyncMedia] 🩹 Hydrated ${healed}/${pending.length} media for conversation ${conversationId}`);
    }
    return healed;
  }
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

    let currentMsg = msg;
    let triedReupload = false;

    const performDownload = async (): Promise<{ stream?: Readable; buffer?: Buffer }> => {
      // 1. Try stream first
      try {
        const stream = await downloadMediaMessage(currentMsg, "stream", {}, ctx);
        if (stream) return { stream: stream as Readable };
      } catch {
        // 2. Try buffer fallback
        const buffer = await downloadMediaMessage(currentMsg, "buffer", {}, ctx);
        if (buffer && buffer.length > 0) return { buffer };
      }
      throw new Error("No content returned from downloadMediaMessage");
    };

    try {
      const downloadResult = await performDownload();
      const ext = mime.extension(rawMime) || "bin";
      const filename = `sync_${whatsappMessageId}.${ext}`;
      let uploadResult;

      if (downloadResult.stream) {
        uploadResult = await storageService.uploadStream(companyId, downloadResult.stream, filename, rawMime);
      } else if (downloadResult.buffer) {
        uploadResult = await storageService.uploadStream(companyId, Readable.from(downloadResult.buffer), filename, rawMime);
      }

      if (uploadResult?.url) {
        return { url: uploadResult.url, mimetype: rawMime };
      }
    } catch (dlErr: unknown) {
      if (mediaCtx?.reuploadRequest && !triedReupload) {
        try {
          Logger.info(`[SyncMedia] Primary download failed for ${whatsappMessageId}. Requesting refreshed URLs from phone...`);
          const refreshedMsg = await mediaCtx.reuploadRequest(msg);
          if (refreshedMsg && refreshedMsg.message) {
            currentMsg = refreshedMsg;
            triedReupload = true;

            const retryResult = await performDownload();
            const ext = mime.extension(rawMime) || "bin";
            const filename = `sync_${whatsappMessageId}.${ext}`;
            let uploadResult;

            if (retryResult.stream) {
              uploadResult = await storageService.uploadStream(companyId, retryResult.stream, filename, rawMime);
            } else if (retryResult.buffer) {
              uploadResult = await storageService.uploadStream(companyId, Readable.from(retryResult.buffer), filename, rawMime);
            }

            if (uploadResult?.url) {
              return { url: uploadResult.url, mimetype: rawMime };
            }
          }
        } catch (retryErr: unknown) {
          const errorMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          Logger.warn(`[SyncMedia] Retry download failed for ${whatsappMessageId} after phone URL update: ${errorMsg}`);
        }
      } else {
        const errorMsg = dlErr instanceof Error ? dlErr.message : String(dlErr);
        Logger.debug(`[SyncMedia] [FAILED] ${whatsappMessageId} (${mediaType}): ${errorMsg}`);
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
