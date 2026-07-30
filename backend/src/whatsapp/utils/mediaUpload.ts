import { Logger } from "@/utils/logger";
import { MediaPayload } from "../core/types/whatsapp.types";

/**
 * Uploads a base64 `data:` media payload to S3 and returns a copy pointing at
 * the hosted URL. No-op for anything that isn't a data URL (already-hosted
 * media, e.g. the frontend's own upload-then-send flow).
 *
 * Callers should run this before enqueueing a queue-based send: doing it
 * inside the send worker instead ties up that company's concurrency-1 queue
 * slot (and the per-conversation DistributedLock) for as long as the upload
 * takes, blocking every other queued message behind it.
 */
export async function uploadBase64MediaToS3(
  companyId: string,
  media: MediaPayload | undefined,
): Promise<MediaPayload | undefined> {
  if (!media || !media.url.startsWith("data:")) return media;

  const { storageService } = await import("@/services/StorageService");

  const base64Data = media.url.split(",")[1];
  const buffer = Buffer.from(base64Data, "base64");

  const result = await storageService.uploadFile(
    companyId,
    buffer,
    media.filename || `${media.type}-${Date.now()}.webm`,
    media.mimetype || "application/octet-stream",
    false,
  );

  Logger.info(`[MediaUpload] Uploaded to S3: ${result.key}`);

  return {
    ...media,
    url: result.url,
  };
}
