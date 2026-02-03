import {
  downloadMediaMessage,
  WAMessage,
  AnyMessageContent,
} from "@whiskeysockets/baileys";
import { MediaType } from "@prisma/client";
import { storageService } from "@/services/storageService";
import { Logger } from "@/utils/logger";
import { Readable } from "stream";
import mime from "mime-types";
import { MediaPayload } from "../core/types/whatsapp.types";
import fs from "fs";

export class MediaProcessorService {
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

    Logger.info("[MediaProcessor] Processing media extraction", {
      messageId,
      messageType,
    });

    const ignoredTypes = [
      "protocolMessage",
      "senderKeyDistributionMessage",
      "reactionMessage",
      "keepInChatMessage",
      "pollUpdateMessage",
    ];

    if (ignoredTypes.includes(messageType)) {
      Logger.debug(`[MediaProcessor] Ignoring message type: ${messageType}`, {
        messageId,
      });
      return null;
    }

    const startTime = Date.now();

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

            Logger.debug(`[MediaProcessor] Uploading stream for ${messageId}`, {
              mimetype,
              filename,
            });

            const uploadResult = await storageService.uploadStream(
              stream as Readable,
              filename,
              mimetype,
            );
            mediaUrl = uploadResult.url;
            mediaSize = Number(
              (msgObj?.fileLength as number | bigint | undefined) || 0,
            );

            Logger.info(`[MediaProcessor] Media processed successfully`, {
              messageId,
              mediaUrl,
              mediaSize,
              durationMs: Date.now() - startTime,
            });
          }
        } catch (e) {
          Logger.error(`[MediaProcessor] Download failed for ${messageId}`, e);
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

  /**
   * Prepares media content for sending via Baileys.
   * Handles URL adjustments for internal API, local file checks, and object construction.
   */
  async prepareMediaContent(media: MediaPayload): Promise<{
    content: AnyMessageContent;
    metaType: "image" | "video" | "audio" | "document";
  }> {
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
        throw new Error(`Local media file not found: ${media.url}`);
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
      messageContent = {
        audio: { url: media.url },
        mimetype: "audio/mp4",
        ptt: true,
      };
      metaType = "audio";
    } else {
      throw new Error(`Unsupported media type: ${media.type}`);
    }

    return { content: messageContent, metaType };
  }

  public mapBaileysToMediaType(baileysType: string): MediaType {
    const type = baileysType.toLowerCase();
    if (type.includes("image")) return MediaType.IMAGE;
    if (type.includes("video")) return MediaType.VIDEO;
    if (type.includes("audio")) return MediaType.AUDIO;
    return MediaType.DOCUMENT;
  }
}

export const mediaProcessor = new MediaProcessorService();
