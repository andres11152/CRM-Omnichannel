import {
  WAMessage,
  AnyMessageContent,
  getContentType,
} from "@whiskeysockets/baileys";
import { MediaType } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { MediaPayload } from "../core/types/whatsapp.types";
import fs from "fs";
import path from "path";
import os from "os";
import { getMediaPlaceholder } from "@/utils/mediaUtils";
import { storageService } from "@/services/StorageService";
import { mediaRepository } from "@/repositories/MediaRepository";

// Delegated sub-services for SRP compliance
import { mediaDownloaderService } from "./media/MediaDownloaderService";
import { mediaUploaderService } from "./media/MediaUploaderService";
import { audioConverterService } from "./media/AudioConverterService";

export interface PreparedMediaResult {
  content: AnyMessageContent;
  metaType: "image" | "video" | "audio" | "document";
  tempFilePath: string | null;
}

/**
 *  MEDIA PROCESSOR SERVICE (Facade)
 *
 * Handles media-related operations by orchestrating specialized sub-services:
 * - MediaDownloaderService: Downloads from WA via Baileys.
 * - MediaUploaderService: Uploads to S3 & DB.
 * - AudioConverterService: Handles FFmpeg conversion.
 */
export class MediaProcessorService {
  /**
   * Extracts text and media content from a Baileys WAMessage.
   * Orchestrates download and storage persistence.
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

    // Unwrap ephemeral and view-once messages to extract the inner media content
    if (messageType === "ephemeralMessage") {
      const inner = (message.message as Record<string, unknown>)?.ephemeralMessage as { message?: WAMessage["message"] } | undefined;
      if (inner?.message) {
        return this.extractMessageContent(companyId, { ...message, message: inner.message }, messageId, sessionId, getSession);
      }
      return null;
    }
    if (messageType === "viewOnceMessageV2" || messageType === "viewOnceMessageV2Extension") {
      const inner = (message.message as Record<string, unknown>)?.[messageType] as { message?: WAMessage["message"] } | undefined;
      if (inner?.message) {
        return this.extractMessageContent(companyId, { ...message, message: inner.message }, messageId, sessionId, getSession);
      }
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
        textContent = " This message was deleted";
      } else {
        textContent = "[System/Protocol]";
      }
    } else if (messageType === "buttonsResponseMessage") {
      textContent =
        (message.message?.buttonsResponseMessage?.selectedButtonId as string) ||
        "[Button Response]";
    } else if (messageType === "listResponseMessage") {
      textContent =
        (message.message?.listResponseMessage?.title as string) ||
        "[List Response]";
    } else if (messageType === "templateButtonReplyMessage") {
      textContent =
        (message.message?.templateButtonReplyMessage?.selectedId as string) ||
        "[Template Response]";
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

          // [SEC] MAX-SIZE GUARD (50MB Limit)
          const MAX_SIZE = 50 * 1024 * 1024;
          const reportedSize = Number(
            (msgObj?.fileLength as number | bigint | undefined) || 0,
          );
          if (reportedSize > MAX_SIZE) {
             Logger.warn(`[MediaProcessor] Skipping large file (${reportedSize} bytes) for ${messageId}`);
             return { textContent: "[WARNING] File too large (>50MB)" };
          }

          // 1. Download via specialized service
          const buffer = await mediaDownloaderService.downloadWithRetry(
            message, messageType, msgObj, messageId, sessionId, getSession
          );

          if (buffer && buffer.length > 0) {
            mediaType = this.mapBaileysToMediaType(messageType);
            
            // 2. Upload and persist via specialized service
            const uploadResult = await mediaUploaderService.uploadAndPersist(
              companyId,
              buffer,
              messageId,
              mediaType,
              reportedSize,
              msgObj
            );

            mediaUrl = uploadResult.mediaUrl;
            mediaSize = uploadResult.mediaSize;
          }
        } catch (e: unknown) {
          if ((e as Error)?.name === "InvalidAccessKeyId") {
            Logger.error(`[MediaProcessor] Download failed for ${messageId}: Invalid AWS S3 Access Key ID.`);
          } else {
            Logger.error(`[MediaProcessor] Download failed for ${messageId}`, e);
          }
          if (!textContent) textContent = "";
        }
      } else {
        const content = message.message as unknown as Record<string, unknown>;
        const msgObj = content[messageType] as Record<string, unknown> | undefined;
        if (msgObj) {
          textContent = getMediaPlaceholder(messageType);
        }
      }
    }

    if (!textContent && !mediaUrl && !mediaType) {
      return null;
    }

    return { textContent, mediaUrl, mediaType, mediaSize };
  }

  /**
   * Prepares outbound media for sending via Baileys.
   */
  async prepareOutboundContent(
    media: MediaPayload,
  ): Promise<PreparedMediaResult> {
    let tempFilePath: string | null = null;
    let resolvedUrl = media.url || "";

    if (resolvedUrl && (resolvedUrl.startsWith("companies/") || resolvedUrl.startsWith("/companies/"))) {
      try {
        const key = resolvedUrl.startsWith("/") ? resolvedUrl.slice(1) : resolvedUrl;
        resolvedUrl = await storageService.getSignedUrl(key, 3600);
      } catch (e) {
        Logger.error(`[MediaProcessor] Failed to generate signed URL for S3 key: ${resolvedUrl}`);
        throw new MediaFileNotFoundError(resolvedUrl, media.caption);
      }
    }

    if (resolvedUrl && resolvedUrl.startsWith("/api/")) {
      const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
      const cleanBackendUrl = backendUrl.replace(/\/$/, "");
      resolvedUrl = `${cleanBackendUrl}${resolvedUrl}`;
    }

    // Resolve local media URLs back to absolute local disk paths to bypass loopback network request issues.
    let localKey = "";
    if (resolvedUrl && resolvedUrl.includes("/api/local-media/")) {
      localKey = resolvedUrl.split("/api/local-media/")[1];
    } else if (resolvedUrl && (resolvedUrl.startsWith("companies/") || resolvedUrl.startsWith("/companies/"))) {
      const key = resolvedUrl.startsWith("/") ? resolvedUrl.slice(1) : resolvedUrl;
      const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
      if (provider !== "s3") {
        localKey = key;
      }
    }

    if (localKey) {
      const uploadDir = path.join(os.tmpdir(), "omnicrm_uploads");
      const localFilePath = path.join(uploadDir, localKey);
      if (fs.existsSync(localFilePath)) {
        Logger.info(`[MediaProcessor] Resolved local file path for sending: ${localFilePath}`);
        resolvedUrl = localFilePath;
      }
    }

    const isHttp = resolvedUrl.startsWith("http://") || resolvedUrl.startsWith("https://");
    const isData = resolvedUrl.startsWith("data:");

    if (!isHttp && !isData) {
      if (!fs.existsSync(resolvedUrl)) {
        throw new MediaFileNotFoundError(resolvedUrl, media.caption);
      }
    }

    let messageContent: AnyMessageContent;
    let metaType: "image" | "video" | "audio" | "document";

    const resolvedMedia = { ...media, url: resolvedUrl };

    if (resolvedMedia.type === "image") {
      messageContent = { image: { url: resolvedMedia.url }, caption: resolvedMedia.caption };
      metaType = "image";
    } else if (resolvedMedia.type === "video") {
      messageContent = { video: { url: resolvedMedia.url }, caption: resolvedMedia.caption };
      metaType = "video";
    } else if (resolvedMedia.type === "document") {
      messageContent = {
        document: { url: resolvedMedia.url },
        mimetype: resolvedMedia.mimetype || "application/octet-stream",
        fileName: resolvedMedia.filename || "file",
        caption: resolvedMedia.caption,
      };
      metaType = "document";
    } else if (resolvedMedia.type === "audio") {
      // Delegate to specialized audio service
      const result = await audioConverterService.prepareAudioContent(resolvedMedia);
      messageContent = result.content;
      tempFilePath = result.tempFilePath;
      metaType = "audio";
    } else if ((resolvedMedia.type as string) === "sticker") {
      messageContent = { sticker: { url: resolvedMedia.url } };
      metaType = "image";
    } else if ((resolvedMedia.type as string) === "file") {
      const result = await this.prepareFileContent(resolvedMedia);
      messageContent = result.content;
      metaType = "document";
    } else {
      throw new Error(`Unsupported media type: ${resolvedMedia.type}`);
    }

    return { content: messageContent, metaType, tempFilePath };
  }

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

  public mapBaileysToMediaType(baileysType: string): MediaType {
    const type = baileysType.toLowerCase();
    if (type.includes("image")) return MediaType.IMAGE;
    if (type.includes("video")) return MediaType.VIDEO;
    if (type.includes("audio")) return MediaType.AUDIO;
    return MediaType.DOCUMENT;
  }
}

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
