import { whatsappService } from "@/whatsapp";
import { Logger } from "@/utils/logger";
import TenantContextManager from "@/config/tenantContext";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";

/**
 * [PERF] Worker Loader (Scale-Optimized)
 *
 * CHANGE LOG (Scale Audit Fix):
 * - BEFORE: Loaded ALL active companies at boot → 1000 companies = 3000 Redis connections = crash
 * - AFTER:  Only loads workers for companies with CONNECTED WhatsApp sessions (typically <5% of tenants)
 * - Workers for remaining companies are initialized ON-DEMAND when they connect a WA session
 *
 * This reduces startup Redis connections from O(n_companies) to O(n_active_sessions).
 */

/** Track which companies have had their message worker started */
const initializedWorkers = new Set<string>();

// [QUEUED-FIX] When messageQueueService evicts an idle queue, the processor that
// startWorker() attached dies with the closed queue object. Clear the tracker so
// the next enqueue's ensureWorkerForCompany() actually restarts the worker on the
// recreated queue — otherwise jobs pile up in QUEUED with no consumer.
import("@/services/queue/messageQueueService")
  .then(({ messageQueueService }) => {
    messageQueueService.onQueueEvicted((companyId) => {
      initializedWorkers.delete(companyId);
    });
  })
  .catch((err) => {
    Logger.error("[Loader] Failed to register queue-eviction listener", err);
  });

/**
 * Initialize a message queue worker for a single company (idempotent).
 * Can be called from anywhere: session connect, webhook, or manual trigger.
 */
export const ensureWorkerForCompany = async (companyId: string): Promise<void> => {
  if (initializedWorkers.has(companyId)) return;

  try {
    const { getMessageQueueWorker } = await import("@/services/queue/messageQueueWorker");
    const messageWorker = getMessageQueueWorker(whatsappService);
    await messageWorker.startWorker(companyId);
    initializedWorkers.add(companyId);
    Logger.info(`[Loader] [ON-DEMAND] Started message worker for company: ${companyId}`);
  } catch (err) {
    Logger.error(`[Loader] Failed to start on-demand worker for ${companyId}`, err);
  }
};

/**
 * Check if a company already has a running worker.
 */
export const hasWorkerForCompany = (companyId: string): boolean => {
  return initializedWorkers.has(companyId);
};

/**
 * Main worker initialization.
 * Only bootstraps workers for companies that have an active (CONNECTED) WhatsApp session.
 */
export const initWorkers = async () => {
  Logger.info("[Loader] [PERF] Initializing Background Workers (Scale-Optimized)...");
  try {
    // ── SHARED WORKERS (Always initialize, independent of tenants) ──

    // 1. Flow Queue Worker
    Logger.info("[Loader] [SYNC] Initializing Flow Queue Workers...");
    const { flowQueueWorker } = await import("@/services/queue/flowQueueWorker");
    flowQueueWorker.startWorker();

    // 2. Cron Queue Worker
    Logger.info("[Loader] [CRON] Initializing Cron Queue Workers...");
    const { initCronWorker } = await import("@/services/queue/cronQueueService");
    const cronWorker = await initCronWorker();

    // 2b. Workflow Resume Worker (CRM automation "delay" node)
    Logger.info("[Loader] [WORKFLOW] Initializing Workflow Resume Worker...");
    const { workflowResumeQueueWorker } = await import("@/services/queue/workflowResumeQueueWorker");
    workflowResumeQueueWorker.startWorker();

    // 3. Group Contact Indexer
    Logger.info("[Loader] [CONTACTS] Initializing Group Contact Indexer...");
    const { groupContactIndexer } = await import("@/services/queue/groupContactIndexer");
    groupContactIndexer.startWorker();

    // 4. History Sync Worker
    Logger.info("[Loader] [HISTORY] Initializing History Sync Workers...");
    const { HistorySyncWorker } = await import("@/services/queue/historySyncWorker");
    const historySyncWorker = new HistorySyncWorker();

    // 5. Outbound Callback Worker
    Logger.info("[Loader] [CALLBACKS] Initializing Outbound Callback Workers...");
    const { OutboundCallbackWorker } = await import("@/services/queue/outboundCallbackWorker");
    const outboundCallbackWorker = new OutboundCallbackWorker();

    // ── TENANT MESSAGE WORKERS (Lazy — Only for active sessions) ──

    // [SEC] SCALE FIX: Instead of loading ALL companies, only load companies
    // that have a CONNECTED WhatsApp session. This reduces Redis connections
    // from potentially 3,000+ to typically 10-50.
    const activeSessions = await TenantContextManager.runAsSystem(async () =>
      whatsappSessionRepository.findByStatus("CONNECTED"),
    );

    // Deduplicate by companyId (a company may have multiple sessions)
    const activeCompanyIds = [...new Set(activeSessions.map((s) => s.companyId))];

    Logger.info(
      `[Loader] Found ${activeCompanyIds.length} companies with active WA sessions (vs loading ALL companies)`,
    );

    const { getMessageQueueWorker } = await import("@/services/queue/messageQueueWorker");
    const messageWorker = getMessageQueueWorker(whatsappService);

    for (const companyId of activeCompanyIds) {
      Logger.info(`[Loader] Starting worker for active company: ${companyId}`);
      await messageWorker.startWorker(companyId);
      initializedWorkers.add(companyId);
    }

    Logger.info(
      `[Loader] [OK] ${activeCompanyIds.length} message queue workers initialized (lazy mode)`,
    );

    // Graceful shutdown handler
    process.on("SIGTERM", async () => {
      Logger.info("[Loader] [SHUTDOWN] SIGTERM received, shutting down gracefully...");
      await messageWorker.shutdown();
      await historySyncWorker.shutdown();
      await outboundCallbackWorker.shutdown();
      const { messageQueueService } = await import("@/services/queue/messageQueueService");
      await messageQueueService.shutdown();
      await flowQueueWorker.shutdown();
      await workflowResumeQueueWorker.shutdown();
      await cronWorker.close();
      await groupContactIndexer.shutdown();
      initializedWorkers.clear();
      process.exit(0);
    });
  } catch (workerError: unknown) {
    const msg = workerError instanceof Error ? workerError.message : String(workerError);

    if (
      msg.includes("Connection timeout") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("getaddrinfo") ||
      msg.includes("ETIMEDOUT") ||
      String(msg).toLowerCase().includes("error")
    ) {
      Logger.warn(
        `[Loader] [WARNING] Redis connection failed for Workers. Running without Message Queues. (Reason: ${msg})`,
      );
    } else {
      Logger.error("[Loader] [ERROR] Failed to initialize workers:");
      Logger.error(workerError as string);
    }
    Logger.info("[Loader] [WARNING] Continuing without queue workers...");
  }
};
