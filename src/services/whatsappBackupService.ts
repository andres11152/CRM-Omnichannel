import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";
import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * 🔐 WHATSAPP SESSION BACKUP SYSTEM
 * Automatic backup every 6 hours to prevent total data loss
 * Uses Redis keys directly (Baileys stores auth state in Redis)
 */

const BACKUP_DIR = path.join(process.cwd(), "backups", "whatsapp-sessions");
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const RETENTION_DAYS = 7; // Keep backups for 7 days

export class WhatsAppBackupService {
  private backupTimer: NodeJS.Timeout | null = null;

  /**
   * Start automatic backup service
   */
  async start(): Promise<void> {
    // Ensure backup directory exists
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    // Initial backup on startup
    await this.performBackup();

    // Schedule periodic backups
    this.backupTimer = setInterval(async () => {
      await this.performBackup();
    }, BACKUP_INTERVAL);

    Logger.info("[WhatsApp Backup] Service started - Backups every 6 hours");
  }

  /**
   * Stop backup service
   */
  stop(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
      Logger.info("[WhatsApp Backup] Service stopped");
    }
  }

  /**
   * Perform backup of all WhatsApp Redis keys
   */
  async performBackup(): Promise<void> {
    try {
      Logger.info("[WhatsApp Backup] Starting backup...");
      const startTime = Date.now();

      // Check Redis availability
      if (!redisClient || !redisClient.isOpen) {
        Logger.warn("[WhatsApp Backup] Redis not available, skipping backup");
        return;
      }

      // Get all Baileys auth keys from Redis
      const authKeys = await redisClient.keys("baileys:*");
      const storeKeys = await redisClient.keys("wwebstore:*");
      const allKeys = [...authKeys, ...storeKeys];

      if (allKeys.length === 0) {
        Logger.info("[WhatsApp Backup] No WhatsApp data to backup");
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);

      // Fetch all keys data
      const backupData: Record<string, any> = {
        timestamp: new Date().toISOString(),
        version: "1.0",
        keysCount: allKeys.length,
        keys: {},
      };

      for (const key of allKeys) {
        try {
          const value = await redisClient.get(key);
          if (value) {
            backupData.keys[key] = value;
          }
        } catch (error) {
          Logger.warn(`[WhatsApp Backup] Failed to backup key ${key}:`, error);
        }
      }

      // Write backup file
      await fs.writeFile(
        backupPath,
        JSON.stringify(backupData, null, 2),
        "utf-8"
      );

      // Compress backup for storage efficiency
      await this.compressBackup(backupPath);

      // Clean old backups
      await this.cleanOldBackups();

      const duration = Date.now() - startTime;
      Logger.info(
        `[WhatsApp Backup] ✅ Backup completed: ${allKeys.length} keys in ${duration}ms`
      );
    } catch (error) {
      Logger.error("[WhatsApp Backup] ❌ Backup failed:", error);
      // Don't throw - we don't want to crash the app if backup fails
    }
  }

  /**
   * Compress backup file with gzip
   */
  private async compressBackup(filePath: string): Promise<void> {
    try {
      await execAsync(`gzip "${filePath}"`);
      Logger.info(`[WhatsApp Backup] Compressed: ${filePath}.gz`);
    } catch (error) {
      Logger.warn(
        "[WhatsApp Backup] Compression failed, keeping uncompressed:",
        error
      );
    }
  }

  /**
   * Clean backups older than retention period
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(BACKUP_DIR);
      const now = Date.now();
      const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          await fs.unlink(filePath);
          Logger.info(`[WhatsApp Backup] Deleted old backup: ${file}`);
        }
      }
    } catch (error) {
      Logger.error("[WhatsApp Backup] Cleanup failed:", error);
    }
  }

  /**
   * Restore session from latest backup
   */
  async restoreSession(sessionId: string): Promise<boolean> {
    try {
      Logger.info(
        `[WhatsApp Backup] Attempting to restore session ${sessionId}`
      );

      if (!redisClient || !redisClient.isOpen) {
        Logger.warn("[WhatsApp Backup] Redis not available for restore");
        return false;
      }

      // Find latest backup
      const files = await fs.readdir(BACKUP_DIR);
      const backupFiles = files
        .filter(
          (f) =>
            f.startsWith("backup-") &&
            (f.endsWith(".json") || f.endsWith(".json.gz"))
        )
        .sort()
        .reverse();

      if (backupFiles.length === 0) {
        Logger.warn("[WhatsApp Backup] No backups found");
        return false;
      }

      for (const backupFile of backupFiles) {
        let backupPath = path.join(BACKUP_DIR, backupFile);

        // Decompress if needed
        if (backupFile.endsWith(".gz")) {
          const decompressedPath = backupPath.replace(".gz", "");
          await execAsync(`gunzip -c "${backupPath}" > "${decompressedPath}"`);
          backupPath = decompressedPath;
        }

        const content = await fs.readFile(backupPath, "utf-8");
        const backupData = JSON.parse(content);

        // Find keys for this session
        const sessionPattern = `baileys:${sessionId}`;
        let restored = 0;

        for (const [key, value] of Object.entries(backupData.keys)) {
          if (key.includes(sessionPattern)) {
            try {
              await redisClient.set(key, value as string);
              restored++;
            } catch (error) {
              Logger.warn(
                `[WhatsApp Backup] Failed to restore key ${key}:`,
                error
              );
            }
          }
        }

        if (restored > 0) {
          Logger.info(
            `[WhatsApp Backup] ✅ Restored ${restored} keys for session ${sessionId}`
          );
          return true;
        }
      }

      Logger.warn("[WhatsApp Backup] Session not found in any backup");
      return false;
    } catch (error) {
      Logger.error("[WhatsApp Backup] Restore failed:", error);
      return false;
    }
  }

  /**
   * Manual backup trigger (for critical moments)
   */
  async backupNow(): Promise<void> {
    Logger.info("[WhatsApp Backup] Manual backup triggered");
    await this.performBackup();
  }
}

// Singleton instance
export const whatsappBackupService = new WhatsAppBackupService();

// Auto-start on import (only in production)
if (process.env.NODE_ENV === "production") {
  whatsappBackupService.start().catch((err) => {
    Logger.error("[WhatsApp Backup] Failed to start:", err);
  });
}
