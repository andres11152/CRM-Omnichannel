import cron from "node-cron";
import {
  runGDPRCleanup,
  getSoftDeleteStats,
} from "@/services/gdprCleanupService";
import { Logger } from "@/utils/logger";

/**
 * 🕐 CRON JOBS
 *
 * Scheduled tasks for background processing:
 * - GDPR cleanup (daily at 2 AM)
 * - Soft delete stats logging (weekly)
 */

/**
 * Initialize all cron jobs
 */
export function initializeCronJobs() {
  Logger.info("[Cron] Initializing scheduled jobs...");

  // ========================================
  // 1. GDPR CLEANUP JOB
  // ========================================
  // Runs daily at 2:00 AM (low-traffic time)
  // Permanently deletes soft-deleted records older than 30 days
  cron.schedule(
    "0 2 * * *",
    async () => {
      Logger.info("[Cron] Starting GDPR cleanup job...");

      try {
        const result = await runGDPRCleanup();

        if (result.totalDeleted > 0) {
          Logger.info(
            `[Cron] GDPR cleanup completed: ${result.totalDeleted} records deleted`,
            result.details,
          );
        } else {
          Logger.info("[Cron] GDPR cleanup completed: No records to delete");
        }
      } catch (error) {
        Logger.error("[Cron] GDPR cleanup failed:", error);
        // TODO: Send alert to admins via email/Slack
      }
    },
    {
      timezone: "America/Mexico_City", // Adjust to your timezone
    },
  );

  Logger.info("[Cron] ✅ GDPR cleanup job scheduled (daily at 2 AM)");

  // ========================================
  // 2. SOFT DELETE STATS JOB (Optional)
  // ========================================
  // Runs weekly on Monday at 9 AM
  // Logs statistics about soft-deleted records for monitoring
  cron.schedule(
    "0 9 * * 1",
    async () => {
      Logger.info("[Cron] Fetching soft delete stats...");

      try {
        const stats = await getSoftDeleteStats();

        Logger.info("[Cron] Soft delete stats:", {
          contacts: `${stats.contacts.total} deleted (${stats.contacts.readyForCleanup} ready for cleanup)`,
          deals: `${stats.deals.total} deleted (${stats.deals.readyForCleanup} ready for cleanup)`,
          tickets: `${stats.tickets.total} deleted (${stats.tickets.readyForCleanup} ready for cleanup)`,
          campaigns: `${stats.campaigns.total} deleted (${stats.campaigns.readyForCleanup} ready for cleanup)`,
        });

        // TODO: Send weekly report to admins
      } catch (error) {
        Logger.error("[Cron] Soft delete stats failed:", error);
      }
    },
    {
      timezone: "America/Mexico_City",
    },
  );

  Logger.info(
    "[Cron] ✅ Soft delete stats job scheduled (weekly on Monday at 9 AM)",
  );

  // ========================================
  // 3. MANUAL CLEANUP ENDPOINT (for testing)
  // ========================================
  // Expose a manual trigger via API endpoint if needed
  // Example: POST /api/admin/cleanup/gdpr
}

/**
 * Manually trigger GDPR cleanup (for testing or admin panel)
 */
export async function manualGDPRCleanup() {
  Logger.info("[Manual] Triggering GDPR cleanup...");
  return await runGDPRCleanup();
}
