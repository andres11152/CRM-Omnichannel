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

  // [SEC] Voice notes MUST be OGG/Opus. The browser's MediaRecorder only ever
  // produces WebM (see frontend/src/components/AudioRecorder.tsx), and
  // Baileys does NOT transcode outbound audio — its only ffmpeg usage is
  // video thumbnails. Sending WebM as a PTT audioMessage still reaches
  // "sent"/"delivered" (WhatsApp ACKs the encrypted blob without validating
  // its codec) but the recipient's client can't decode it and the note never
  // renders — a silent, unrecoverable delivery failure that looks identical
  // to success in every status webhook. Convert before upload so what lands
  // in S3 (and gets sent) is always playable.
  const isAudio = media.type === "audio";
  const isAlreadyOgg = (media.mimetype || "").toLowerCase().includes("ogg");

  if (isAudio && !isAlreadyOgg) {
    const { convertAudioToMP4, cleanupTempFile } = await import("@/utils/audioConverter");
    const { readFile } = await import("fs/promises");

    let convertedPath: string | null = null;
    try {
      convertedPath = await convertAudioToMP4(media.url);
      const buffer = await readFile(convertedPath);

      const result = await storageService.uploadFile(
        companyId,
        buffer,
        media.filename ? media.filename.replace(/\.[^./]+$/, ".ogg") : `voice-note-${Date.now()}.ogg`,
        "audio/ogg; codecs=opus",
        false,
      );

      Logger.info(`[MediaUpload] Converted voice note to OGG/Opus and uploaded to S3: ${result.key}`);

      return {
        ...media,
        url: result.url,
        mimetype: "audio/ogg; codecs=opus",
      };
    } catch (err) {
      // [SEC] Fail loudly instead of falling back to the raw WebM — an
      // upload that "succeeds" but produces an unplayable voice note is
      // worse than a visible send failure the agent can retry.
      Logger.error(`[MediaUpload] Audio conversion to OGG/Opus failed — aborting upload:`, err);
      throw err;
    } finally {
      if (convertedPath) {
        await cleanupTempFile(convertedPath);
      }
    }
  }

  const base64Data = media.url.split(",")[1];
  const buffer = Buffer.from(base64Data, "base64");

  const { extension } = await import("mime-types");
  const inferredExt = (media.mimetype && extension(media.mimetype)) || "bin";

  const result = await storageService.uploadFile(
    companyId,
    buffer,
    media.filename || `${media.type}-${Date.now()}.${inferredExt}`,
    media.mimetype || "application/octet-stream",
    false,
  );

  Logger.info(`[MediaUpload] Uploaded to S3: ${result.key}`);

  return {
    ...media,
    url: result.url,
  };
}
