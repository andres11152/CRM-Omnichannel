import { whatsappService } from "@/whatsapp";
import { prisma } from "@/config/database";
import { Logger } from "@/utils/logger";

/**
 * 👷 Worker Loader
 * Initializes background workers for message queues and flows.
 */
export const initWorkers = async () => {
  Logger.info("[Loader] 🚀 Initializing Message Queue Workers...");
  try {
    // Initialize Flow Queue Worker
    Logger.info("[Loader] 🌊 Initializing Flow Queue Workers...");
    const { flowQueueWorker } =
      await import("@/services/queue/flowQueueWorker");
    flowQueueWorker.startWorker();

    // Initialize Cron Queue Worker
    Logger.info("[Loader] ⏰ Initializing Cron Queue Workers...");
    const { initCronWorker } =
      await import("@/services/queue/cronQueueService");
    const cronWorker = await initCronWorker();

    const { getMessageQueueWorker } =
      await import("@/services/queue/messageQueueWorker");
    // Get singleton instance with whatsappService
    const messageWorker = getMessageQueueWorker(whatsappService);

    // Start workers for all active companies
    const companies = await prisma.company.findMany({
      where: { isActive: true },
    });
    Logger.info(`[Loader] Found ${companies.length} active companies`);

    for (const company of companies) {
      Logger.info(
        `[Loader] Starting worker for: ${company.name} (${company.id})`,
      );
      await messageWorker.startWorker(company.id);
    }
    Logger.info(
      `[Loader] ✅ ${companies.length} message queue workers initialized`,
    );

    // Graceful shutdown handler
    process.on("SIGTERM", async () => {
      Logger.info("[Loader] 🛑 SIGTERM received, shutting down gracefully...");
      await messageWorker.shutdown();
      const { messageQueueService } =
        await import("@/services/queue/messageQueueService");
      await messageQueueService.shutdown();
      await flowQueueWorker.shutdown();
      await cronWorker.close();
      process.exit(0);
    });
  } catch (workerError: unknown) {
    const msg =
      workerError instanceof Error ? workerError.message : String(workerError);

    if (
      msg.includes("Connection timeout") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("getaddrinfo") ||
      msg.includes("ETIMEDOUT") ||
      String(msg).toLowerCase().includes("error")
    ) {
      Logger.warn(
        `[Loader] ⚠️ Redis connection failed for Workers. Running without Message Queues. (Reason: ${msg})`,
      );
    } else {
      Logger.error("[Loader] ❌ Failed to initialize workers:");
      Logger.error(workerError as string);
    }
    Logger.info("[Loader] ⚠️ Continuing without queue workers...");
  }
};

