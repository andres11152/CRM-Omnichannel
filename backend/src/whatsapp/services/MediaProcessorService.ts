import {
  downloadMediaMessage,
  WAMessage,
  AnyMessageContent,
} from "@whiskeysockets/baileys";
import { MediaType } from "@prisma/client";
import { mediaRepository } from "@/repositories/MediaRepository";
import { storageService } from "@/services/storageService";
import { Logger } from "@/utils/logger";
import { Readable } from "stream";
import mime from "mime-types";
import { MediaPayload } from "../core/types/whatsapp.types";
import { convertAudioToMP4 } from "@/utils/audioConverter";
import fs from "fs";

/** Result type for outbound media preparation */
export interface PreparedMediaResult {
  content: AnyMessageContent;
  metaType: "image" | "video" | "audio" | "document";
  tempFilePath: string | null;
}

/**
 * 🎬 MEDIA PROCESSOR SERVICE
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
    message: WAMessage,
    messageId: string,
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

    const messageType = Object.keys(message.message || {})[0];
    if (!messageType) return null;

    const ignoredTypes = [
      "protocolMessage",
      "senderKeyDistributionMessage",
      "reactionMessage",
      "keepInChatMessage",
      "pollUpdateMessage",
    ];

    if (ignoredTypes.includes(messageType)) {
      return null;
    }

    if (messageType === "conversation") {
      textContent = message.message?.conversation || "";
    } else if (messageType === "extendedTextMessage") {
      textContent = message.message?.extendedTextMessage?.text || "";
    } else {
      const supportedMedia = [
        "imageMessage",
        "videoMessage",
        "audioMessage",
        "documentMessage",
        "stickerMessage",
      ];
      if (supportedMedia.includes(messageType)) {
        try {
          const stream = await downloadMediaMessage(message, "stream", {});
          const content = message.message as unknown as Record<string, unknown>;
          const msgObj = content[messageType] as
            | Record<string, unknown>
            | undefined;

          textContent =
            (msgObj?.caption as string) ||
            (msgObj?.text as string) ||
            (msgObj?.fileName as string) ||
            `[${this.mapBaileysToMediaType(messageType)}]`;

          if (stream) {
            mediaType = this.mapBaileysToMediaType(messageType);
            const mimetype: string =
              (msgObj?.mimetype as string | undefined) ||
              "application/octet-stream";
            const ext = mime.extension(mimetype) || "bin";
            const filename = `${messageId}.${ext}`;

            const uploadResult = await storageService.uploadStream(
              stream as Readable,
              filename,
              mimetype,
            );
            mediaUrl = uploadResult.url;
            mediaSize = Number(
              (msgObj?.fileLength as number | bigint | undefined) || 0,
            );
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
        }
      } else {
        const content = message.message as unknown as Record<string, unknown>;
        const msgObj = content[messageType] as
          | Record<string, unknown>
          | undefined;
        if (msgObj) {
          textContent = `[${messageType}]`;
        }
      }
    }

    if (!textContent && !mediaUrl && !mediaType) {
      return null;
    }

    return { textContent, mediaUrl, mediaType, mediaSize };
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
        const dbMedia = await mediaRepository.findById(mediaId, {
          mimeType: true,
        });
        if (dbMedia?.mimeType) {
          realMimeType = dbMedia.mimeType;
        }
      } catch (err) {
        Logger.warn(`[MediaProcessor] ⚠️ Failed to resolve MIME from DB:`, err);
      }
    }

    const isWebM =
      realMimeType === "audio/webm" ||
      media.url.toLowerCase().endsWith(".webm");
    const needsConversion = isBase64 || isWebM;

    if (needsConversion) {
      try {
        tempFilePath = await convertAudioToMP4(media.url);
        const audioBuffer = fs.readFileSync(tempFilePath);

        return {
          content: {
            audio: audioBuffer,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
          },
          tempFilePath,
        };
      } catch (error) {
        Logger.error(
          "[MediaProcessor] ❌ Conversion failed, falling back to raw:",
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
        const dbMedia = await mediaRepository.findById(mediaId, {
          mimeType: true,
          filename: true,
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
