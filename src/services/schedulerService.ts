import { prisma } from "@/config/database";
// ♻️ REFACTOR: Unified Service
import { whatsappService } from "@/whatsapp";
import { notificationJobs } from "@/services/notificationJobs";
import { Logger } from "@/utils/logger";
import TenantContextManager from "@/config/tenantContext";
import type { MediaPayload } from "@/whatsapp/core/types/whatsapp.types";

// 🔒 CONCURRENCY LOCK: Prevent overlapping scheduler cycles
let isSchedulerRunning = false;

/**
 * 🔧 HELPER: Execute query with timeout protection
 * Wraps a promise with a timeout to prevent hung connections
 */
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
              `[Scheduler] ${operationName} timed out after ${timeoutMs}ms`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
};

export const initScheduler = () => {
  Logger.info("⏰ Scheduler Service Initialized");

  // ⏰ SCHEDULED MESSAGES (every 30 seconds)
  setInterval(async () => {
    // 🔒 LOCK: Skip if previous cycle is still running
    if (isSchedulerRunning) {
      Logger.warn("[Scheduler] ⏳ Previous cycle still running, skipping...");
      return;
    }

    isSchedulerRunning = true;

    try {
      // 🛡️ SYSTEM MODE: Cron job needs access to all scheduled messages across tenants
      await TenantContextManager.runAsSystem(async () => {
        const now = new Date();

        // 1. Fetch pending scheduled messages WITH TIMEOUT (use prismaRaw for system operations)
        const pendingMessages = await withTimeout(
          prisma.message.findMany({
            where: {
              status: "SCHEDULED",
            },
            include: { conversation: true },
            take: 50, // 🔥 LIMIT: Process max 50 per cycle to prevent pool exhaustion
          }),
          15000, // 15 second timeout
          "Fetch scheduled messages",
        );

        for (const msg of pendingMessages) {
          const meta = msg.metadata as Record<string, unknown> | null;
          if (!meta || !meta.scheduledAt) continue;

          const scheduledTime = new Date(meta.scheduledAt as string);

          if (scheduledTime <= now) {
            Logger.info(
              `⏰ Executing Scheduled Message ${msg.id} for Conv ${msg.conversationId}`,
            );

            let targetPhone = msg.conversation.channelId;
            // Fallback for missing channelId (common in imported chats)
            if (!targetPhone) {
              const users = await withTimeout(
                prisma.user.findMany({
                  where: {
                    conversations: { some: { id: msg.conversationId } },
                    role: "USER",
                  },
                  take: 1,
                }),
                5000, // 5 second timeout
                "Find user phone",
              );
              if (users[0]?.phone) targetPhone = users[0].phone;
            }

            if (!targetPhone) {
              Logger.warn(
                `Skipping scheduled msg ${msg.id}: No channelId/Phone found`,
              );
              continue;
            }

            try {
              // 2. Send via WhatsApp Service (Creates NEW Sent Message)
              await whatsappService.sendMessage(targetPhone, msg.content, {
                companyId: msg.conversation.companyId,
                conversationId: msg.conversation.id,
                senderId: msg.senderId,
                media: meta.attachment as MediaPayload | undefined,
                metadata: { wasScheduled: true },
              });

              // 3. Delete the "Pending" placeholder so user sees the real SENT message
              await withTimeout(
                prisma.message.delete({
                  where: { id: msg.id },
                }),
                5000,
                "Delete scheduled placeholder",
              );

              Logger.info(`✅ Scheduled Msg Executed & Placeholder Deleted`);
            } catch (sendError) {
              Logger.error(
                `Failed to execute scheduled msg ${msg.id}`,
                sendError,
              );
            }
          }
        }
      });
    } catch (e) {
      // Only log if it's not a timeout (timeouts are expected under high load)
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (!errorMessage.includes("timed out")) {
        Logger.error("Scheduler Cycle Error", e);
      } else {
        Logger.warn(`[Scheduler] ⏳ ${errorMessage}`);
      }
    } finally {
      // 🔓 ALWAYS release lock
      isSchedulerRunning = false;
    }
  }, 30000);

  // 💰 BILLING & QUOTA CHECKS (every 6 hours)
  setInterval(
    async () => {
      try {
        Logger.info("[Scheduler] Starting billing and quota checks");
        await TenantContextManager.runAsSystem(() =>
          notificationJobs.checkBillingAndQuotas(),
        );
      } catch (error) {
        Logger.error("[Scheduler] Billing checks failed", error);
      }
    },
    6 * 60 * 60 * 1000,
  ); // 6 hours

  // Run immediately on startup
  setTimeout(() => {
    TenantContextManager.runAsSystem(() =>
      notificationJobs.checkBillingAndQuotas(),
    ).catch((err) =>
      Logger.error("[Scheduler] Initial billing check failed", err),
    );
  }, 5000);

  // 📱 WHATSAPP SESSION CHECKS (every hour)
  setInterval(
    async () => {
      try {
        Logger.info("[Scheduler] Checking WhatsApp sessions");
        await TenantContextManager.runAsSystem(() =>
          notificationJobs.checkWhatsAppSessions(),
        );
      } catch (error) {
        Logger.error("[Scheduler] WhatsApp checks failed", error);
      }
    },
    60 * 60 * 1000,
  ); // 1 hour

  // 🎫 INACTIVE TICKET CHECKS (every 6 hours)
  setInterval(
    async () => {
      try {
        Logger.info("[Scheduler] Checking inactive tickets");
        await TenantContextManager.runAsSystem(() =>
          notificationJobs.checkInactiveTickets(),
        );
      } catch (error) {
        Logger.error("[Scheduler] Ticket checks failed", error);
      }
    },
    6 * 60 * 60 * 1000,
  ); // 6 hours

  // 💾 BACKUP CHECKS (daily at 3 AM)
  const scheduleDaily3AM = () => {
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setHours(3, 0, 0, 0);

    if (next3AM <= now) {
      next3AM.setDate(next3AM.getDate() + 1);
    }

    const msUntil3AM = next3AM.getTime() - now.getTime();

    setTimeout(() => {
      TenantContextManager.runAsSystem(() =>
        notificationJobs.checkFailedBackups(),
      ).catch((err) => Logger.error("[Scheduler] Backup check failed", err));

      // Schedule next day
      setInterval(
        () => {
          TenantContextManager.runAsSystem(() =>
            notificationJobs.checkFailedBackups(),
          ).catch((err) =>
            Logger.error("[Scheduler] Backup check failed", err),
          );
        },
        24 * 60 * 60 * 1000,
      );
    }, msUntil3AM);
  };

  scheduleDaily3AM();

  Logger.info("✅ All notification jobs scheduled");
};
