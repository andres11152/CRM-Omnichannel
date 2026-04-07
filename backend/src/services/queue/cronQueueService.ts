import { Queue, Worker, Job } from "bullmq";
import { connection } from "@/config/bullmq";
import { Logger } from "@/utils/logger";
import TenantContextManager from "@/config/tenantContext";

// Services to call
import {
  runGDPRCleanup,
  getSoftDeleteStats,
} from "@/services/GdprCleanupService";
import { notificationJobs } from "@/services/NotificationJobs";
import { schedulerRepository } from "@/repositories/SchedulerRepository";
import { whatsappService } from "@/whatsapp";
import type { MediaPayload } from "@/whatsapp/core/types/whatsapp.types";

/**
 * ⏰ CRON QUEUE SERVICE (BullMQ)
 * Handles all scheduled and recurring background tasks natively across multiple servers.
 * Replaces node-cron and setInterval.
 */

const CRON_QUEUE_NAME = "cron-jobs-queue";

const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `[CronQueue] ${operationName} timed out after ${timeoutMs}ms`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
};

export const cronQueue = new Queue(CRON_QUEUE_NAME, { connection });

export const initCronWorker = async () => {
  Logger.info(`[CronQueue]  Initializing Cron Queue Worker...`);

  const worker = new Worker(
    CRON_QUEUE_NAME,
    async (job: Job) => {
      try {
        switch (job.name) {
          case "gdpr-cleanup": {
            Logger.info("[CronQueue] Starting GDPR cleanup...");
            const gdprResult = await runGDPRCleanup();
            if (gdprResult.totalDeleted > 0) {
              Logger.info(
                `[CronQueue] GDPR cleanup completed: ${gdprResult.totalDeleted} records deleted`,
                gdprResult.details,
              );
            }
            break;
          }
          case "soft-delete-stats": {
            Logger.info("[CronQueue] Fetching soft delete stats...");
            const stats = await getSoftDeleteStats();
            Logger.info("[CronQueue] Soft delete stats:", {
              contacts: `${stats.contacts.total} deleted (${stats.contacts.readyForCleanup} ready)`,
              deals: `${stats.deals.total} deleted (${stats.deals.readyForCleanup} ready)`,
              tickets: `${stats.tickets.total} deleted (${stats.tickets.readyForCleanup} ready)`,
              campaigns: `${stats.campaigns.total} deleted (${stats.campaigns.readyForCleanup} ready)`,
            });
            break;
          }
          case "scheduled-messages": {
            // Executes pending scheduled messages
            await TenantContextManager.runAsSystem(async () => {
              const pendingMessages = await withTimeout(
                schedulerRepository.findPendingScheduledMessages(50),
                15000,
                "Fetch scheduled messages",
              );
              const now = new Date();

              for (const msg of pendingMessages) {
                const meta = msg.metadata as Record<string, unknown> | null;
                if (!meta || !meta.scheduledAt) continue;

                const scheduledTime = new Date(meta.scheduledAt as string);
                if (scheduledTime <= now) {
                  Logger.info(
                    `[CronQueue] ⏰ Executing Scheduled Message ${msg.id}`,
                  );
                  let targetPhone = msg.conversation.channelId;
                  if (!targetPhone) {
                    const users = await withTimeout(
                      schedulerRepository.findUsersForConversation(
                        msg.conversationId,
                        1,
                      ),
                      5000,
                      "Find phone",
                    );
                    if (users[0]?.phone) targetPhone = users[0].phone;
                  }
                  if (!targetPhone) continue;

                  try {
                    await whatsappService.sendMessage(
                      targetPhone,
                      msg.content,
                      {
                        companyId: msg.conversation.companyId,
                        conversationId: msg.conversation.id,
                        senderId: msg.senderId,
                        media: meta.attachment as MediaPayload | undefined,
                        metadata: { wasScheduled: true },
                      },
                    );

                    await withTimeout(
                      schedulerRepository.deleteScheduledMessage(msg.id),
                      5000,
                      "Delete placeholder",
                    );
                  } catch (e) {
                    Logger.error(
                      `[CronQueue] Failed to execute msg ${msg.id}`,
                      e,
                    );
                  }
                }
              }
            });
            break;
          }
          case "billing-checks": {
            await TenantContextManager.runAsSystem(() =>
              notificationJobs.checkBillingAndQuotas(),
            );
            break;
          }
          case "whatsapp-checks": {
            await TenantContextManager.runAsSystem(() =>
              notificationJobs.checkWhatsAppSessions(),
            );
            break;
          }
          case "inactive-tickets": {
            await TenantContextManager.runAsSystem(() =>
              notificationJobs.checkInactiveTickets(),
            );
            break;
          }
          case "failed-backups": {
            await TenantContextManager.runAsSystem(() =>
              notificationJobs.checkFailedBackups(),
            );
            break;
          }
          default:
            Logger.warn(`[CronQueue] Unknown job name: ${job.name}`);
        }
      } catch (err) {
        Logger.error(`[CronQueue] Error processing job ${job.name}:`, err);
        throw err;
      }
    },
    { connection, concurrency: 5 }, // Native locking and concurrency!
  );

  worker.on("failed", (job, err) => {
    Logger.error(`[CronQueue] [ERROR] Job ${job?.name} failed:`, err);
  });

  // Schedule Jobs using BullMQ repeatable feature
  await cronQueue.add(
    "scheduled-messages",
    {},
    { repeat: { every: 30000 }, jobId: "rep-scheduled-messages" },
  );
  await cronQueue.add(
    "gdpr-cleanup",
    {},
    { repeat: { pattern: "0 2 * * *" }, jobId: "rep-gdpr-cleanup" },
  );
  await cronQueue.add(
    "soft-delete-stats",
    {},
    { repeat: { pattern: "0 9 * * 1" }, jobId: "rep-soft-stats" },
  );
  await cronQueue.add(
    "billing-checks",
    {},
    { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: "rep-billing-checks" },
  );
  await cronQueue.add(
    "whatsapp-checks",
    {},
    { repeat: { every: 60 * 60 * 1000 }, jobId: "rep-whatsapp-checks" },
  );
  await cronQueue.add(
    "inactive-tickets",
    {},
    { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: "rep-inactive-tickets" },
  );
  await cronQueue.add(
    "failed-backups",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "rep-failed-backups" },
  );

  Logger.info(`[CronQueue] [OK] Scheduled 7 repeating jobs in Redis.`);

  return worker;
};
