import { Job } from "bull";
import { MessageJob, messageQueueService } from "./messageQueueService";
import { WhatsAppService } from "@/whatsapp/WhatsAppService";
import { messageRepository } from "@/repositories/MessageRepository";
import { Logger } from "../../utils/logger";
import { MediaPayload } from "@/whatsapp/core/types/whatsapp.types";
import { DistributedLock } from "@/utils/distributedLock";
import { contextStorage } from "@/context/requestContext";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";

/**
 * [SEC] Anti-ban blocks (warm-up daily limit, rate limit, health pause) are
 * NOT transient: the daily quota resets in hours, not seconds. Retrying them
 * 10 times with exponential backoff (~17 min) is guaranteed to fail every
 * time while keeping the message stuck in "EN COLA" and burning CPU/locks.
 */
const isAntiBanBlock = (msg: string): boolean =>
  msg.includes("[baileys-antiban] Message blocked");

interface WorkerResult {
  success: boolean;
  messageId: string;
  sentAt: Date;
}

/**
 * MESSAGE QUEUE WORKER
 *
 * Processes queued messages in the background.
 * Features:
 * - Waits for WhatsApp session to be ready
 * - Uploads media to S3
 * - Sends via WhatsAppService
 * - Reports progress
 */

class MessageQueueWorker {
  private whatsappService: WhatsAppService;
  private activeWorkers: Map<string, boolean> = new Map();
  private socketEmitter = new SocketEventEmitter(gateway);

  constructor(whatsappService: WhatsAppService) {
    this.whatsappService = whatsappService;
  }

  /**
   * Start worker for a specific company.
   *
   * [ORDER FIX] Concurrency MUST be 1 per company. All of a company's outbound
   * messages are dispatched through a SINGLE WhatsApp socket (one phone number),
   * so they are inherently sequential. Running 3 concurrent workers made the jobs
   * race for the per-conversation DistributedLock; the lock's random jitter meant
   * whichever worker's timer fired first won, scrambling delivery order
   * (e.g. sent 1..10, arrived 1,5,6,3,2,8,4,10,9,7). Worse, starved jobs could not
   * acquire the lock within Bull's 60s job timeout and FAILED, then got retried
   * out of order. Concurrency 1 guarantees strict FIFO dispatch per company.
   */
  async startWorker(companyId: string): Promise<void> {
    if (this.activeWorkers.has(companyId)) {
      Logger.warn(`[Worker:${companyId}] Already running`);
      return;
    }

    const queue = messageQueueService.getQueue(companyId);

    queue.process(1, async (job: Job<MessageJob>) => {
      // [SEC] SECURITY CONTEXT INJECTION
      // Background workers run outside the HTTP request lifecycle. We must manually
      // inject the companyId into the contextStorage so Prisma RLS can function.
      return contextStorage.run({
        companyId: job.data.companyId,
        userId: job.data.senderId,
        requestId: `job:${job.id}`,
      }, () => {
        // [SEC] 100-YEAR FIX: Enforce Sequentiality per Conversation
        // This prevents out-of-order delivery to the same recipient while allowing
        // concurrency across different chats in the same company.
        const lockKey = `msg_proc:${job.data.conversationId}`;

        return DistributedLock.run(
          lockKey,
          () => this.processMessage(job),
          60000, // TTL 60s (fail-safe if worker crashes, gives plenty of time for media uploads and cooldowns)
          90000  // Wait up to 90s for previous message to finish in the queue
        );
      });
    });

    // When all retries are exhausted, mark the DB record as FAILED so the UI
    // stops showing "EN COLA" permanently.
    queue.on("failed", async (job: Job<MessageJob>, err: Error) => {
      const maxAttempts = (job.opts?.attempts as number | undefined) ?? 10;
      if (job.attemptsMade < maxAttempts) return; // Still has retries remaining

      const metadata = job.data.metadata as Record<string, unknown> | undefined;
      const dbId = metadata?.dbId as string | undefined;
      if (!dbId) return;

      Logger.error(
        `[Worker:${companyId}] Job ${job.id} permanently failed after ${job.attemptsMade} attempts — marking message ${dbId} as FAILED`,
        err,
      );

      try {
        await contextStorage.run(
          { companyId, userId: job.data.senderId, requestId: `job-failed:${job.id}` },
          async () => {
            await messageRepository
              .update(dbId, { status: "FAILED" }, companyId)
              .catch((updateErr: Error) => {
                // Warn (not error): the message row may not exist if the job was
                // from a different environment or the DB record was never committed.
                Logger.warn(
                  `[Worker:${companyId}] Could not mark message ${dbId} as FAILED (row not found or already removed): ${updateErr.message}`,
                );
              });
          },
        );
      } catch (ctxErr) {
        Logger.error(
          `[Worker:${companyId}] Context error when marking message ${dbId} as FAILED:`,
          ctxErr,
        );
      }
    });

    this.activeWorkers.set(companyId, true);
    Logger.info(`[Worker:${companyId}]  Started (sequential, concurrency 1 for strict ordering)`);
  }

  /**
   * Process a single message job
   */
  private async processMessage(job: Job<MessageJob>): Promise<WorkerResult> {
    const { companyId, conversationId, senderId, to, text, media, quotedMessageId } = job.data;

    try {
      // 1. Report progress: Waiting for session
      await job.progress(10);
      Logger.info(
        `[Worker] Processing job ${job.id}: ${to} (${media?.type || "text"})`,
      );

      // 2. Wait for WhatsApp session to be ready
      await this.waitForSession(companyId);
      await job.progress(30);

      // 3. If media, upload to S3 first
      let uploadedMedia = media;
      if (media && media.url.startsWith("data:")) {
        await job.progress(40);
        uploadedMedia = await this.uploadMediaToS3(companyId, media);
        await job.progress(60);
      }

      const metadata = job.data.metadata as Record<string, string | number | boolean | null> | undefined;
      const dbId = metadata?.dbId as string | undefined;

      //  ANTI-DUPLICATION STRICT CHECK: Avoid resending if this job was retried
      // after the message was successfully dispatched
      if (dbId) {
        const existingMessage = await messageRepository.findUnique({ where: { id: dbId } });
        // NOTE: We omit companyId in findUnique because it's not part of the unique index or id alone is unique. Actually we can do findFirst to include companyId
        if (existingMessage && ["SENT", "DELIVERED", "READ"].includes(existingMessage.status)) {
          Logger.warn(`[Worker] Job ${job.id} skipped - Message ${dbId} already marked as ${existingMessage.status}`);
          return { success: true, messageId: existingMessage.whatsappMessageId || "", sentAt: new Date() };
        }
      }

      // 3. [AI] HUMAN-LIKE BEHAVIOR: brief "typing" presence before sending.
      // [UX] Kept SHORT (0.3-0.7s). The old 1.5-3s here + 2-5s cooldown below meant
      // 3.5-8s PER message under concurrency-1, so a burst of 10 manual messages sat
      // 35-80s in "EN COLA". Agent 1:1 chat doesn't need heavy anti-ban throttling.
      await job.progress(40);
      const typingTime = Math.floor(Math.random() * (700 - 300 + 1) + 300); // 0.3 - 0.7s

      // Emit "composing" presence carefully
      try {
        await this.whatsappService.sendPresenceUpdate(to, "composing", companyId);
      } catch (err) {
        Logger.warn(`[Worker] Failed to emit composing presence for ${to}`, err);
      }
      await new Promise((r) => setTimeout(r, typingTime));

      // 4. Send via executeQueuedMessage (Bypasses global queue to prevent loops)
      await job.progress(70);

      const sessions = await this.whatsappService.getSessions(companyId);
      const activeSession = sessions.find((s) => s.status === "CONNECTED");
      const sessionId = activeSession?.sessionId || "";

      const result = await this.whatsappService.executeQueuedMessage(
        sessionId,
        to,
        text,
        {
          companyId,
          conversationId,
          senderId,
          metadata: metadata as Record<string, string | number | boolean | null> | undefined,
          dbId, // Pass the database record ID for status update
          media: uploadedMedia,
          quotedMessageId, // ️ FIX: Propagate quoted message ID
        },
      );

      // Stop composing carefully
      try {
        await this.whatsappService.sendPresenceUpdate(to, "paused", companyId);
      } catch (err) {
        Logger.warn(`[Worker] Failed to emit paused presence for ${to}`, err);
      }

      // 5. POST-SEND COOL-DOWN — short (0.3-0.8s) just to avoid hammering WhatsApp.
      // (Was 2-5s, the main cause of outbound messages piling up in "EN COLA".)
      const cooldown = Math.floor(Math.random() * (800 - 300 + 1) + 300);
      await new Promise((r) => setTimeout(r, cooldown));

      await job.progress(100);

      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date(),
      };
    } catch (error: unknown) {
      const isError = error instanceof Error;
      const errMsg = isError ? error.message : String(error);

      // [SEC] FAIL-FAST for anti-ban blocks: the daily warm-up quota won't
      // reset within Bull's retry window, so retrying is pure waste and the
      // agent stares at a permanent "EN COLA". Mark FAILED immediately with
      // the reason and notify the UI, then discard remaining retries.
      if (isAntiBanBlock(errMsg)) {
        Logger.warn(
          `[Worker] Job ${job.id} blocked by anti-ban protection (no retries): ${errMsg}`,
        );

        const metadata = job.data.metadata as Record<string, unknown> | undefined;
        const dbId = metadata?.dbId as string | undefined;
        if (dbId) {
          await messageRepository
            .update(dbId, { status: "FAILED" }, companyId)
            .catch((e: Error) =>
              Logger.warn(`[Worker] Could not mark ${dbId} FAILED: ${e.message}`),
            );
          this.socketEmitter.emitMessageStatus(
            dbId,
            conversationId,
            companyId,
            "failed",
          );
        }

        job.discard(); // Prevent Bull from scheduling further attempts
        throw error;
      }

      Logger.error(
        `[Worker] Job ${job.id} failed for CompanyId: ${companyId}`,
        {
          companyId,
          conversationId,
          to,
          error: errMsg,
          stack: isError ? error.stack : undefined,
        },
      );
      throw error; // Bull will retry automatically
    }
  }

  /**
   * Wait for WhatsApp session to be ready
   * Prevents sending when connection is not open
   */
  private async waitForSession(companyId: string): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const isConnected =
        await this.whatsappService.isCompanyConnected(companyId);

      if (isConnected) {
        Logger.info(`[Worker] Session ready for ${companyId}`);
        return;
      }

      // Wait 500ms before checking again
      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error(`Session not ready after ${maxWait}ms`);
  }

  /**
   * Upload media to S3
   */
  private async uploadMediaToS3(
    companyId: string,
    media: MediaPayload, // Use strictly typed MediaPayload
  ): Promise<MediaPayload> {
    if (!media) return media;

    const { storageService } = await import("../StorageService");

    // Check if it's already a URL (not data URI)
    if (!media.url.startsWith("data:")) {
      return media;
    }

    const base64Data = media.url.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");

    const result = await storageService.uploadFile(
      companyId,
      buffer,
      media.filename || `${media.type}-${Date.now()}.webm`,
      media.mimetype || "application/octet-stream",
      false,
    );

    Logger.info(`[Worker]  Media uploaded to S3: ${result.key}`);

    return {
      ...media,
      url: result.url, // Replace with S3 URL
    };
  }

  /**
   * Stop worker for a company
   */
  async stopWorker(companyId: string): Promise<void> {
    this.activeWorkers.delete(companyId);
    Logger.info(`[Worker:${companyId}] Stopped`);
  }

  /**
   * Stop all workers
   */
  async shutdown(): Promise<void> {
    Logger.info("[Worker] Shutting down all workers...");
    this.activeWorkers.clear();
  }
}

// Singleton instance
let workerInstance: MessageQueueWorker;

export function getMessageQueueWorker(
  whatsappService: WhatsAppService,
): MessageQueueWorker {
  if (!workerInstance) {
    workerInstance = new MessageQueueWorker(whatsappService);
  }
  return workerInstance;
}
