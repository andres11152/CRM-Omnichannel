import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { promises as fs } from "fs";
import * as path from "path";
import { Buffer } from "buffer";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Converts audio from base64 data URL to MP4/AAC format compatible with WhatsApp PTT
 * @param base64DataUrl - Base64 encoded audio data URL (e.g., "data:audio/webm;base64,...")
 * @returns Promise<string> - Path to the converted MP4 file
 */
export async function convertAudioToMP4(
  base64DataUrl: string
): Promise<string> {
  // Extract base64 data from data URL
  // Updated regex to handle more complex mime types (e.g. including codecs)
  // Matches: data:[mime-type];base64,[data]
  const matches = base64DataUrl.match(
    /^data:([A-Za-z0-9-+\/;= ]+);base64,(.+)$/
  );

  if (!matches || matches.length !== 3) {
    console.error(
      "[AudioConverter] Invalid format. URL start:",
      base64DataUrl.substring(0, 50)
    );
    throw new Error("Invalid base64 data URL format");
  }

  const base64Data = matches[2];
  const audioBuffer = Buffer.from(base64Data, "base64");

  // Create temporary files
  const tempDir = path.join(process.cwd(), "temp");
  await fs.mkdir(tempDir, { recursive: true });

  const inputFile = path.join(tempDir, `input_${Date.now()}.webm`);
  const outputFile = path.join(tempDir, `output_${Date.now()}.ogg`);

  try {
    // Write input buffer to temp file
    await fs.writeFile(inputFile, audioBuffer);

    // Convert using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputFile)
        .audioCodec("libopus")
        .format("ogg")
        .on("end", () => {
          console.log("[AudioConverter] Conversion completed successfully");
          resolve();
        })
        .on("error", (err: Error) => {
          console.error("[AudioConverter] Conversion error:", err);
          reject(err);
        })
        .save(outputFile);
    });

    // Clean up input file
    await fs.unlink(inputFile).catch(() => {});

    return outputFile;
  } catch (error) {
    // Clean up files on error
    await fs.unlink(inputFile).catch(() => {});
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
    console.log(`[AudioConverter] Cleaned up temp file: ${filePath}`);
  } catch (error) {
    console.warn(
      `[AudioConverter] Failed to cleanup temp file: ${filePath}`,
      error
    );
  }
}
