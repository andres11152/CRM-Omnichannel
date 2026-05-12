import { AnyMessageContent } from "@whiskeysockets/baileys";
import { MediaPayload } from "../../core/types/whatsapp.types";
import { mediaRepository } from "@/repositories/MediaRepository";
import { Logger } from "@/utils/logger";
import { convertAudioToMP4 } from "@/utils/audioConverter";

export class AudioConverterService {
  async prepareAudioContent(
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
        Logger.warn(`[AudioConverter] [WARNING] Failed to resolve MIME from DB:`, err);
      }
    }

    const isWebM =
      (realMimeType && realMimeType.includes("audio/webm")) ||
      media.url.toLowerCase().includes(".webm");
    const needsConversion = isBase64 || isWebM;

    if (needsConversion) {
      Logger.info(`[AudioConverter] Starting audio conversion (isBase64: ${isBase64}, isWebM: ${isWebM})`);
      try {
        tempFilePath = await convertAudioToMP4(media.url);
        Logger.info(`[AudioConverter] Conversion success: ${tempFilePath}`);

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
          "[AudioConverter] [ERROR] Conversion failed, falling back to raw:",
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

    // No conversion needed
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
}

export const audioConverterService = new AudioConverterService();
