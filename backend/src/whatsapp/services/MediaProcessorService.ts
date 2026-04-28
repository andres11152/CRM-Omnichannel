import {
  downloadMediaMessage,
  downloadContentFromMessage,
  WAMessage,
  AnyMessageContent,
  getContentType,
} from "@whiskeysockets/baileys";
import { MediaType } from "@prisma/client";
import { mediaRepository } from "@/repositories/MediaRepository";
import { storageService } from "@/services/StorageService";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";
import { Readable } from "stream";
import mime from "mime-types";
import { MediaPayload } from "../core/types/whatsapp.types";
import { convertAudioToMP4 } from "@/utils/audioConverter";
import fs from "fs";
import { prisma } from "@/config/database";
import { getMediaPlaceholder } from "@/utils/mediaUtils";

/** Result type for outbound media preparation */
export interface PreparedMediaResult {
  content: AnyMessageContent;
  metaType: "image" | "video" | "audio" | "document";
  tempFilePath: string | null;
}

/**
 *  MEDIA PROCESSOR SERVICE
 *
 * Handles all media-related operations:
 * - Inbound: Extract content from Baileys WAMessage (download, upload to storage)
 * - Outbound: Prepare AnyMessageContent for sending via Baileys
 *
 * Includes:
 * - Audio conversion (WebM/Base64 → OGG Opus via FFmpeg)
 * - Proxy URL MIME resolution from DB
 * - Local file validation
 * - Internal API URL adjustment
 * - Sticker/file/document handling
 */
export class MediaProcessorService {
  // ────────────────────────────────────────────────
  // INBOUND: Extract content from incoming message
  // ────────────────────────────────────────────────

  /**
   * Extracts text and media content from a Baileys WAMessage.
   * Downloads media streams, uploads to storage, and returns metadata.
   */
  async extractMessageContent(
    companyId: string,
    message: WAMessage,
    messageId: string,
    sessionId?: string,
    getSession?: (id: string) => import("@whiskeysockets/baileys").WASocket | undefined,
  ): Promise<{
    textContent: string;
    mediaUrl?: string;
    mediaType?: MediaType | null;
    mediaSize?: number;
  } | null> {
    let textContent = "";
    let mediaUrl: string | undefined;
    let mediaSize = 0;
    let mediaType: MediaType | null = null;

    const messageType = message.message
      ? getContentType(message.message)
      : undefined;
    if (!messageType) return null;

    const ignoredTypes = [
      "protocolMessage",
      "senderKeyDistributionMessage",
      "reactionMessage",
      "keepInChatMessage",
      "pollUpdateMessage",
      "pinInChatMessage",
    ];

    if (ignoredTypes.includes(messageType)) {
      return null;
    }

    if (messageType === "conversation") {
      textContent = message.message?.conversation || "";
    } else if (messageType === "extendedTextMessage") {
      textContent = message.message?.extendedTextMessage?.text || "";
    } else if (messageType === "protocolMessage") {
      const proto = message.message?.protocolMessage as {
        type?: number | string;
      };
      if (
        proto.type === 0 ||
        proto.type === "REVOKE" ||
        proto.type === "0" ||
        !proto.type
      ) {
        textContent = " Este mensaje fue eliminado";
      } else {
        textContent = "[Sistema/Protocolo]";
      }
    } else if (messageType === "buttonsResponseMessage") {
      textContent =
        (message.message?.buttonsResponseMessage?.selectedButtonId as string) ||
        "[Respuesta de Botón]";
    } else if (messageType === "listResponseMessage") {
      textContent =
        (message.message?.listResponseMessage?.title as string) ||
        "[Respuesta de Lista]";
    } else if (messageType === "templateButtonReplyMessage") {
      textContent =
        (message.message?.templateButtonReplyMessage?.selectedId as string) ||
        "[Respuesta de Plantilla]";
    } else {
      const supportedMedia = [
        "imageMessage",
        "videoMessage",
        "audioMessage",
        "documentMessage",
        "stickerMessage",
        "documentWithCaptionMessage",
      ];
      if (supportedMedia.includes(messageType)) {
        try {
          mediaType = this.mapBaileysToMediaType(messageType);
          const content = message.message as unknown as Record<string, unknown>;
          
          // Baileys unwrapping for documentWithCaptionMessage
          let msgObj = content[messageType] as Record<string, unknown> | undefined;
          if (messageType === "documentWithCaptionMessage") {
              const innerMessage = msgObj?.message as Record<string, unknown> | undefined;
              if (innerMessage?.documentMessage) {
                  msgObj = innerMessage.documentMessage as Record<string, unknown>;
              }
          }

          textContent =
            (msgObj?.caption as string) ||
            (msgObj?.text as string) ||
            (msgObj?.fileName as string) ||
            getMediaPlaceholder(mediaType);

          // [SEC] MAX-SIZE GUARD (50MB Limit for WhatsApp)
          const MAX_SIZE = 50 * 1024 * 1024;
          const reportedSize = Number(
            (msgObj?.fileLength as number | bigint | undefined) || 0,
          );
          if (reportedSize > MAX_SIZE) {
             Logger.warn(`[MediaProcessor]  Skipping large file (${reportedSize} bytes) for ${messageId}`);
             return { textContent: "[WARNING] Archivo demasiado grande (>50MB)" };
          }

          // Robust dual-method download with retry (with session-based reupload support)
          // Old Historical Media uses a safe-retry loop inside downloadWithRetry that aborts HEAL if age > 2 Hours.

          // Robust dual-method download with retry (with session-based reupload support)
          const buffer = await this.downloadWithRetry(message, messageType, msgObj, messageId, sessionId, getSession);

          if (buffer && buffer.length > 0) {
            mediaType = this.mapBaileysToMediaType(messageType);
            const mimetype: string =
              (msgObj?.mimetype as string | undefined) ||
              "application/octet-stream";
            const ext = mime.extension(mimetype) || "bin";
            const originalName = (msgObj?.fileName as string) || `${messageId}.${ext}`;
            const filename = `${messageId}.${ext}`;

            // 1. Upload to Storage (S3 or Local)
            const uploadResult = await storageService.uploadFile(
              companyId,
              buffer,
              filename,
              mimetype,
            );

            // [SEC] FIX: uploadedById is mandatory for Media schema. Find a valid user in the company.
            // Since incoming messages are from customers, we assign the media to any admin/user in the tenant.
            const fallbackUser = await prisma.user.findFirst({
              where: { companyId },
              select: { id: true },
            });

            // 2. Persist to DB (Permanent Reference)
            const mediaRecord = await mediaRepository.create({
              company: { connect: { id: companyId } },
              filename: uploadResult.key,
              originalName: originalName,
              mimeType: mimetype,
              size: buffer.length || reportedSize || 0,
              url: uploadResult.url,
              key: uploadResult.key,
              type: mediaType,
              category: "chat-attachments", // Classify as chat-origin media
              uploadedBy: fallbackUser?.id 
                ? { connect: { id: fallbackUser.id } } 
                : { connect: { email: "system@reply.ai" } },
            });

            // 3. Return internal Proxy URL (Audit-Ready & Persistent)
            mediaUrl = `/api/media/${mediaRecord.id}/content`;
            mediaSize = buffer.length || reportedSize;
          }
        } catch (e: unknown) {
          if ((e as Error)?.name === "InvalidAccessKeyId") {
            Logger.error(
              `[MediaProcessor] Download failed for ${messageId}: Invalid AWS S3 Access Key ID.`,
            );
          } else {
            Logger.error(
              `[MediaProcessor] Download failed for ${messageId}`,
              e,
            );
          }
          
          // Provide fallback text so the frontend knows the media type even if download failed
          if (!textContent) {
            textContent = "";
          }
        }
      } else {
        const content = message.message as unknown as Record<string, unknown>;
        const msgObj = content[messageType] as
          | Record<string, unknown>
          | undefined;
        if (msgObj) {
          textContent = getMediaPlaceholder(messageType);
        }
      }
    }

    // Force preserving mediaType even if mediaUrl is missing so Metadata is built in Orchestrator
    if (!textContent && !mediaUrl && !mediaType) {
      return null;
    }

    return { textContent, mediaUrl, mediaType, mediaSize };
  }

  // ────────────────────────────────────────────────
  // PRIVATE: Robust dual-method download with retry
  // ────────────────────────────────────────────────

  /**
   * Attempts media download using two Baileys methods with retry.
   * Primary: downloadMediaMessage (higher-level, handles type detection internally)
   * Fallback: downloadContentFromMessage (lower-level, manual chunk collection)
   */
  private async downloadWithRetry(
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
        Logger.info(`[MediaProcessor] [ATTEMPT ${attempt}/${MAX_RETRIES}] downloadMediaMessage for ${messageId}`);
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
          Logger.info(`[MediaProcessor] [OK] Downloaded ${buffer.length} bytes via downloadMediaMessage`);
          return buffer;
        }
      } catch (err: unknown) {
        const errorMsg = (err instanceof Error) ? err.message : String(err);
        Logger.warn(`[MediaProcessor] [RETRY] downloadMediaMessage attempt ${attempt} failed: ${errorMsg}`);

        // [SEC] WORKAROUND: Baileys only triggers reuploadRequest for HTTP 404/410 Axios errors.
        // It entirely bypasses its own reupload handler for Crypto 'bad decrypt' errors.
        // We MUST manually update the media keys here to ensure the next attempt succeeds.
        if (errorMsg.includes("bad decrypt") || errorMsg.includes("mac check failed")) {
            const ts = message.messageTimestamp;
            let tsSeconds = 0;
            if (ts) {
                if (typeof ts === "number") {
                    tsSeconds = ts;
                } else if (typeof ts === "object" && ts !== null && "toNumber" in ts && typeof (ts as unknown as Record<string, unknown>).toNumber === "function") {
                    tsSeconds = (ts as { toNumber: () => number }).toNumber();
                } else {
                    tsSeconds = Number(ts);
                }
            }
            const ageSeconds = tsSeconds ? Math.floor(Date.now() / 1000) - tsSeconds : 0;
            
            // [SEC] DDoS PROTECTION: WhatsApp servers heavily rate-limit 'updateMediaMessage' IQ requests.
            // If this is a HistorySync message (> 2 hours old), WA will throw 'Failed to re-upload media (3)'.
            // We abort the retry loop immediately to save the socket connection from 'init queries' timeouts!
            if (tsSeconds > 0 && ageSeconds > 7200) {
                 Logger.warn(`[MediaProcessor] [HEAL] Aborting updateMediaMessage for ${messageId} (Age: ${ageSeconds}s > 2h). Old media keys cannot form new IQ stanzas without risking socket bans.`);
                 break; // Skip the rest of the retries to protect the socket.
            }

            // [SEC] CIRCUIT BREAKER: Check if we are currently rate-limited by WA.
            if (redisClient?.isOpen) {
                const isCircuitOpen = await redisClient.get(`cb:heal:${sessionId}`);
                if (isCircuitOpen) {
                     Logger.warn(`[MediaProcessor] [HEAL] Circuit breaker OPEN for ${sessionId}. Skipping updateMediaMessage for ${messageId} to protect socket.`);
                     break; 
                }
            }

            const sock = sessionId && getSession ? getSession(sessionId) : undefined;
            if (sock?.updateMediaMessage) {
                try {
                     Logger.info(`[MediaProcessor] [HEAL] Forcing WhatsApp server to issue fresh media keys for ${messageId}...`);
                     const freshMessage = await sock.updateMediaMessage(message);
                     message = freshMessage; // Re-assign the entire message

                     // We must also update `msgObj` because the Fallback method uses it directly.
                     if (message.message) {
                        const newContent = message.message as unknown as Record<string, unknown>;
                        let newMsgObj = newContent[messageType] as Record<string, unknown> | undefined;
                        if (messageType === "documentWithCaptionMessage") {
                            const innerMsg = newMsgObj?.message as Record<string, unknown> | undefined;
                            newMsgObj = (innerMsg?.documentMessage || newMsgObj) as Record<string, unknown> | undefined;
                        }
                        if (newMsgObj) msgObj = newMsgObj;
                     }
                     Logger.info(`[MediaProcessor] [HEAL] Keys completely refreshed. Ready for next attempt.`);
                } catch(healErr: unknown) {
                     const healErrorMsg = (healErr instanceof Error) ? healErr.message : String(healErr);
                     Logger.warn(`[MediaProcessor] [HEAL] updateMediaMessage failed: ${healErrorMsg}`);
                     
                     // Open the circuit breaker for 10 minutes if WA rejects the keys request.
                     if (redisClient?.isOpen && (healErrorMsg.includes("Failed to re-upload media") || healErrorMsg.includes("rate-limit") || healErrorMsg.includes("timed out"))) {
                         Logger.error(`[MediaProcessor] [HEAL] Rate limit or rejection detected from WA Server. Opening Circuit Breaker for session ${sessionId} for 10 minutes.`);
                         await redisClient.setEx(`cb:heal:${sessionId}`, 600, "1"); // 600s = 10 minutes
                     }
                }
            }
        }

        // Small delay before retry
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // Method 2: downloadContentFromMessage (fallback – lower-level chunk approach)
    try {
      Logger.info(`[MediaProcessor] [FALLBACK] Trying downloadContentFromMessage for ${messageId}`);
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
        Logger.info(`[MediaProcessor] [OK] Downloaded ${buffer.length} bytes via downloadContentFromMessage`);
        return buffer;
      }
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error) ? err.message : String(err);
      Logger.error(`[MediaProcessor] [FINAL] All download methods failed for ${messageId}: ${errorMsg}`);
    }

    return null;
  }

  // ────────────────────────────────────────────────
  // OUTBOUND: Prepare content for sending
  // ────────────────────────────────────────────────

  /**
   * Prepares outbound media for sending via Baileys.
   *
   * This is the FULL outbound preparation logic extracted from MessageHandler.sendMedia.
   * Handles ALL media types including:
   * - image, video, document (simple URL pass-through)
   * - audio (conversion from base64/webm → OGG Opus, proxy MIME resolution, MP3 handling)
   * - sticker (mapped to image type for Baileys)
   * - file (proxy metadata resolution from DB)
   *
   * @returns PreparedMediaResult containing the Baileys content, meta type, and optional temp file path
   * @throws Error if media type is unsupported or local file not found
   */
  async prepareOutboundContent(
    media: MediaPayload,
  ): Promise<PreparedMediaResult> {
    let tempFilePath: string | null = null;

    // 0. Resolve Raw S3 Keys gracefully
    if (media.url && media.url.startsWith("companies/")) {
      try {
        media.url = await storageService.getSignedUrl(media.url, 3600);
      } catch (e) {
        Logger.error(`[MediaProcessor] Failed to generate signed URL for S3 key: ${media.url}`);
        throw new MediaFileNotFoundError(media.url, media.caption);
      }
    }

    // 1. URL Adjustment for Internal API
    if (media.url && media.url.startsWith("/api/")) {
      const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
      const cleanBackendUrl = backendUrl.replace(/\/$/, "");
      media.url = `${cleanBackendUrl}${media.url}`;
    }

    // 2. Local File Validation
    const isHttp =
      media.url.startsWith("http://") || media.url.startsWith("https://");
    const isData = media.url.startsWith("data:");

    if (!isHttp && !isData) {
      if (!fs.existsSync(media.url)) {
        throw new MediaFileNotFoundError(media.url, media.caption);
      }
    }

    // 3. Construct Content Object based on Type
    let messageContent: AnyMessageContent;
    let metaType: "image" | "video" | "audio" | "document";

    if (media.type === "image") {
      messageContent = { image: { url: media.url }, caption: media.caption };
      metaType = "image";
    } else if (media.type === "video") {
      messageContent = { video: { url: media.url }, caption: media.caption };
      metaType = "video";
    } else if (media.type === "document") {
      messageContent = {
        document: { url: media.url },
        mimetype: media.mimetype || "application/octet-stream",
        fileName: media.filename || "file",
        caption: media.caption,
      };
      metaType = "document";
    } else if (media.type === "audio") {
      const result = await this.prepareAudioContent(media);
      messageContent = result.content;
      tempFilePath = result.tempFilePath;
      metaType = "audio";
    } else if ((media.type as string) === "sticker") {
      messageContent = { sticker: { url: media.url } };
      metaType = "image";
    } else if ((media.type as string) === "file") {
      const result = await this.prepareFileContent(media);
      messageContent = result.content;
      metaType = "document";
    } else {
      throw new Error(`Unsupported media type: ${media.type}`);
    }

    return { content: messageContent, metaType, tempFilePath };
  }

  // ────────────────────────────────────────────────
  // AUDIO: Complex conversion pipeline
  // ────────────────────────────────────────────────

  /**
   * Prepares audio content for WhatsApp sending.
   * Handles:
   * - Proxy MIME resolution from database
   * - Base64/WebM → OGG Opus conversion via FFmpeg
   * - MP3 passthrough (no PTT flag)
   * - OGG codec normalization
   */
  private async prepareAudioContent(
    media: MediaPayload,
  ): Promise<{ content: AnyMessageContent; tempFilePath: string | null }> {
    let realMimeType = media.mimetype;
    let tempFilePath: string | null = null;
    const isBase64 = media.url.startsWith("data:");

    // Resolve real MIME type from DB if URL is a proxy endpoint
    const proxyMatch = !isBase64
      ? media.url.match(/\/api\/media\/([^/]+)\/content/)
      : null;

    if (proxyMatch && proxyMatch[1]) {
      try {
        const mediaId = proxyMatch[1];
        const dbMedia = await mediaRepository.findFirst({
          where: { id: mediaId },
          select: { mimeType: true },
        });
        if (dbMedia?.mimeType) {
          realMimeType = dbMedia.mimeType;
        }
      } catch (err) {
        Logger.warn(`[MediaProcessor] [WARNING] Failed to resolve MIME from DB:`, err);
      }
    }

    const isWebM =
      (realMimeType && realMimeType.includes("audio/webm")) ||
      media.url.toLowerCase().includes(".webm");
    const needsConversion = isBase64 || isWebM;

    if (needsConversion) {
      Logger.info(`[MediaProcessor] Starting audio conversion (isBase64: ${isBase64}, isWebM: ${isWebM})`);
      try {
        tempFilePath = await convertAudioToMP4(media.url);
        Logger.info(`[MediaProcessor] Conversion success: ${tempFilePath}`);

        return {
          content: {
            audio: { url: tempFilePath },
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
          },
          tempFilePath,
        };
      } catch (error) {
        Logger.error(
          "[MediaProcessor] [ERROR] Conversion failed, falling back to raw:",
          error,
        );
        return {
          content: {
            audio: { url: media.url },
            mimetype: realMimeType || "audio/ogg; codecs=opus",
            ptt: true,
          },
          tempFilePath: null,
        };
      }
    }

    // No conversion needed — determine correct MIME
    const isMp3 =
      realMimeType === "audio/mpeg" ||
      realMimeType === "audio/mp3" ||
      media.url.toLowerCase().endsWith(".mp3");

    let finalMime = "audio/ogg; codecs=opus";
    let isPtt = true;

    if (isMp3) {
      finalMime = "audio/mpeg";
      isPtt = false;
    } else if (realMimeType && realMimeType !== "application/octet-stream") {
      finalMime = realMimeType;
      if (finalMime === "audio/ogg" && !finalMime.includes("codecs")) {
        finalMime = "audio/ogg; codecs=opus";
      }
    }

    return {
      content: {
        audio: { url: media.url },
        mimetype: finalMime,
        ptt: isPtt,
      },
      tempFilePath: null,
    };
  }

  // ────────────────────────────────────────────────
  // FILE/DOCUMENT: Proxy metadata resolution
  // ────────────────────────────────────────────────

  /**
   * Prepares file/document content by resolving metadata from DB proxy.
   */
  private async prepareFileContent(
    media: MediaPayload,
  ): Promise<{ content: AnyMessageContent }> {
    let docMime = "application/octet-stream";
    let fileName = "document";

    const proxyMatch = media.url.match(/\/api\/media\/([^/]+)\/content/);
    if (proxyMatch && proxyMatch[1]) {
      try {
        const mediaId = proxyMatch[1];
        const dbMedia = await mediaRepository.findFirst({
          where: { id: mediaId },
          select: { mimeType: true, filename: true },
        });
        if (dbMedia?.mimeType) docMime = dbMedia.mimeType;
        if (dbMedia?.filename) fileName = dbMedia.filename;
      } catch (e) {
        Logger.warn("[MediaProcessor] Failed to resolve document metadata", e);
      }
    }

    return {
      content: {
        document: { url: media.url },
        mimetype: docMime,
        fileName: fileName,
        caption: media.caption || "",
      },
    };
  }

  // ────────────────────────────────────────────────
  // UTILITIES
  // ────────────────────────────────────────────────

  public mapBaileysToMediaType(baileysType: string): MediaType {
    const type = baileysType.toLowerCase();
    if (type.includes("image")) return MediaType.IMAGE;
    if (type.includes("video")) return MediaType.VIDEO;
    if (type.includes("audio")) return MediaType.AUDIO;
    return MediaType.DOCUMENT;
  }
}

/**
 * Custom error for local media file not found.
 * Allows MessageHandler to differentiate and send a warning message instead.
 */
export class MediaFileNotFoundError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly caption?: string,
  ) {
    super(`Local media file not found: ${filePath}`);
    this.name = "MediaFileNotFoundError";
  }
}

export const mediaProcessor = new MediaProcessorService();
