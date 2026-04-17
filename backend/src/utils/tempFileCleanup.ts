import { promises as fs } from "fs";
import * as path from "path";
import { Logger } from "@/utils/logger";

/**
 * [CLEANUP] TEMPORARY FILE CLEANUP SERVICE
 * Deletes files inside the temporary directories that are older than the specified duration.
 * This prevents disk saturation from failed FFmpeg audio conversions or WhatsApp Baileys downloads.
 */
export async function cleanupTempDirectory(maxAgeHours = 1): Promise<void> {
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();
  
  // Clean both standard and compiled temp locations
  const dirsToClean = [
    path.join(process.cwd(), "temp"),
    path.join(process.cwd(), "dist", "temp")
  ];

  let totalDeleted = 0;

  for (const dir of dirsToClean) {
    try {
      // Check if directory exists
      await fs.access(dir);
    } catch {
      continue; // Directory doesn't exist, skip
    }

    try {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (!stats.isFile()) continue;

          // Check if file is older than the max age threshold
          const fileAgeMs = now - stats.mtimeMs;
          if (fileAgeMs > maxAgeMs) {
            await fs.unlink(filePath);
            totalDeleted++;
            Logger.debug(`[TempCleanup] Deleted stale file: ${filePath}`);
          }
        } catch (fileErr) {
          Logger.warn(`[TempCleanup] Could not stat or delete file ${filePath}:`, fileErr);
        }
      }
    } catch (dirErr) {
      Logger.error(`[TempCleanup] Failed to read directory ${dir}:`, dirErr);
    }
  }

  if (totalDeleted > 0) {
    Logger.info(`[TempCleanup] [OK] Successfully reclaimed disk space. Deleted ${totalDeleted} stale temporary files.`);
  } else {
    Logger.debug(`[TempCleanup] No stale files found. Disk is clean.`);
  }
}
