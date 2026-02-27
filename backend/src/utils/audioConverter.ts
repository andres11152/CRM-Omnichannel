import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { promises as fs } from "fs";
import * as path from "path";
import { Buffer } from "buffer";
import { Logger } from "@/utils/logger";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Converts audio from base64 data URL to MP4/AAC format compatible with WhatsApp PTT
 * @param base64DataUrl - Base64 encoded audio data URL (e.g., "data:audio/webm;base64,...")
 * @returns Promise<string> - Path to the converted MP4 file
 */
export async function convertAudioToMP4(inputSource: string): Promise<string> {
  // Create temporary files
  const tempDir = path.join(process.cwd(), "temp");
  await fs.mkdir(tempDir, { recursive: true });

  const outputFile = path.join(tempDir, `output_${Date.now()}.ogg`);
  let inputFile: string | null = null;
  let inputPath = inputSource;

  try {
    // Check if input is Base64 Data URL
    if (inputSource.startsWith("data:")) {
      const matches = inputSource.match(
        /^data:([A-Za-z0-9-+/;= ]+);base64,(.+)$/,
      );

      if (matches && matches.length === 3) {
        // Handle Base64
        const base64Data = matches[2];
        const audioBuffer = Buffer.from(base64Data, "base64");
        inputFile = path.join(tempDir, `input_${Date.now()}.webm`);
        await fs.writeFile(inputFile, audioBuffer);
        inputPath = inputFile;
      } else {
        // If it starts with data: but regex fails, it might be malformed, but we'll try passing it or throw?
        // Let's assume if it fails regex, it's invalid base64.
        Logger.warn(
          "[AudioConverter] Malformed data URI, trying as is or failing.",
        );
      }
    }
    // If not data URI, we treat 'inputSource' as a file path or URL directly.

    // Convert using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec("libopus")
        .format("ogg")
        .on("end", () => {
          Logger.info("[AudioConverter] Conversion completed successfully");
          resolve();
        })
        .on("error", (err: Error) => {
          Logger.error("[AudioConverter] Conversion error:", err);
          reject(err);
        })
        .save(outputFile);
    });

    // Clean up input file ONLY if we created a temp one from base64
    if (inputFile) {
      await fs.unlink(inputFile).catch(() => {});
    }

    return outputFile;
  } catch (error) {
    // Clean up files on error
    if (inputFile) await fs.unlink(inputFile).catch(() => {});
    await fs.unlink(outputFile).catch(() => {});
    throw error;
  }
}

/**
 * Cleans up temporary audio file
 * @param filePath - Path to the file to delete
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    Logger.info(`[AudioConverter] Cleaned up temp file: ${filePath}`);
  } catch (error) {
    Logger.warn(
      `[AudioConverter] Failed to cleanup temp file: ${filePath}`,
      error,
    );
  }
}
