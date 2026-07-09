import { Logger } from "@/utils/logger";
import { storageService } from "@/services/StorageService";
import { Buffer } from "buffer";

export const instagramMediaService = {
  /**
   * Downloads an attachment already hosted at a CDN URL (as delivered in the
   * Instagram Messaging webhook payload) and re-uploads it to S3.
   *
   * Unlike WhatsApp Cloud API, Instagram's webhook already includes a direct
   * download URL — no intermediate "media id → url" lookup is required.
   */
  async processMedia(
    url: string,
    mimeTypeHint: string | undefined,
    companyId: string,
    attachmentType: string,
  ): Promise<{ url: string; key: string; type: "image" | "video" | "audio" | "document" }> {
    try {
      const buffer = await this.downloadBinary(url);
      const type = this.mapAttachmentTypeToType(attachmentType);
      const mimeType = mimeTypeHint || this.guessMimeType(type);
      const ext = this.getExtension(mimeType, type);
      const filename = `${companyId}_ig_${Date.now()}.${ext}`;

      const uploadResult = await storageService.uploadFile(companyId, buffer, filename, mimeType, false);

      Logger.info(`[InstagramMedia] Processed media -> ${uploadResult.url}`);

      return { url: uploadResult.url, key: uploadResult.key, type };
    } catch (error) {
      Logger.error(`[InstagramMedia] Failed to process media from ${url}`, error);
      throw error;
    }
  },

  async downloadBinary(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download Instagram media binary: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },

  mapAttachmentTypeToType(attachmentType: string): "image" | "video" | "audio" | "document" {
    if (attachmentType === "image") return "image";
    if (attachmentType === "video") return "video";
    if (attachmentType === "audio") return "audio";
    return "document";
  },

  guessMimeType(type: "image" | "video" | "audio" | "document"): string {
    const map: Record<string, string> = {
      image: "image/jpeg",
      video: "video/mp4",
      audio: "audio/mpeg",
      document: "application/octet-stream",
    };
    return map[type];
  },

  getExtension(mime: string, fallbackType: "image" | "video" | "audio" | "document"): string {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "audio/mpeg": "mp3",
      "audio/ogg": "ogg",
      "video/mp4": "mp4",
    };
    return map[mime] || fallbackType;
  },
};
