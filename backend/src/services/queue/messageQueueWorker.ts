import { Job, UnrecoverableError, Worker } from "bullmq";
import { MessageJob, messageQueueService } from "./messageQueueService";
import { WhatsAppService } from "@/whatsapp/WhatsAppService";
import { messageRepository } from "@/repositories/MessageRepository";
import { Logger } from "../../utils/logger";
import { MediaPayload } from "@/whatsapp/core/types/whatsapp.types";
import { DistributedLock } from "@/utils/distributedLock";
import { contextStorage } from "@/context/requestContext";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { connection } from "@/config/bullmq";
import { uploadBase64MediaToS3 } from "@/whatsapp/utils/mediaUpload";

const isAntiBanBlock = (msg: string): boolean =>
  msg.includes("[baileys-antiban] Message blocked");

// Mirrors whatsapp-service/src/workers/OutboundWorker.ts's FATAL_PATTERNS —
// retrying an invalid recipient or malformed payload just burns the retry
// budget for no chance of a different outcome.
const FATAL_MESSAGE_PATTERNS = [
  "not on whatsapp",
  "not-on-whatsapp",
  "invalid phone",
  "invalid number",
  "bad jid",
  "recipient is not on whatsapp",
];

const isFatalError = (error: unknown): boolean => {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (FATAL_MESSAGE_PATTERNS.some((p) => msg.includes(p))) return true;

  // 4xx from whatsapp-service (bad payload, validation failure) is a client
  // error — identical input will fail identically on retry. 429 is excluded:
  // that's a transient rate limit, worth retrying with backoff. 5xx/503 (no
  // active session) is left retryable since the session may reconnect.
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 429;
};

interface WorkerResult {
  success: boolean;
  messageId: string;
  sentAt: Date;
  /** Human-like pacing delay (ms) to apply before the worker picks up its
   * next job — undefined for the idempotency-skip path, which shouldn't pay
   * a cooldown for a message it didn't actually send. */
  pacingMs?: number;
}

class MessageQueueWorker {
  private whatsappService: WhatsAppService;
  private activeWorkers: Map<string, Worker> = new Map();
  private socketEmitter = new SocketEventEmitter(gateway);
  // [PERF/BUG] startWorker/stopWorker for the same company must never
  // interleave: evictIdleQueues() fires stopWorker() without awaiting it
  // (see messageQueueService.ts), so an enqueue() landing moments later can
  // call startWorker() while the old worker's close() is still in flight.
  // Without serialization, startWorker() sees the stale activeWorkers entry,
  // bails out with "Already running", and the eviction listener then deletes
  // that entry once close() finally resolves — leaving zero workers for the
  // company with no code path left to restart one. Chaining every
  // start/stop through this per-company lock makes the sequence atomic.
  private workerLocks: Map<string, Promise<unknown>> = new Map();

  constructor(whatsappService: WhatsAppService) {
    this.whatsappService = whatsappService;
    messageQueueService.onQueueEvicted(async (companyId) => {
      await this.stopWorker(companyId);
    });
  }

  private withWorkerLock<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.workerLocks.get(companyId) ?? Promise.resolve();
    const run = prior.catch(() => undefined).then(fn);
    this.workerLocks.set(companyId, run.catch(() => undefined));
    return run;
  }

  async startWorker(companyId: string): Promise<void> {
    return this.withWorkerLock(companyId, () => this.startWorkerLocked(companyId));
  }

  private async startWorkerLocked(companyId: string): Promise<void> {
    if (this.activeWorkers.has(companyId)) {
      Logger.warn(`[Worker:${companyId}] Already running`);
      return;
    }

    const worker = new Worker<MessageJob>(
      `whatsapp-messages-${companyId}`,
      async (job: Job<MessageJob>) => {
        return contextStorage.run({
          companyId: job.data.companyId,
          userId: job.data.senderId,
          requestId: `job:${job.id}`,
        }, async () => {
          const lockKey = `msg_proc:${job.data.conversationId}`;

          const result = await DistributedLock.run(
            lockKey,
            () => this.processMessage(job),
            60000,
            90000
          );

          // Human-like pacing before this worker picks up its next job.
          // Runs after the per-conversation lock is released — the lock
          // only needs to cover the actual dispatch, not this cosmetic
          // delay, and holding it here would block a legitimate fast
          // follow-up message to the same conversation for no reason.
          if (result.pacingMs) {
            this.whatsappService
              .sendPresenceUpdate(job.data.to, "paused", job.data.companyId)
              .catch((err) =>
                Logger.warn(`[Worker] Failed to emit paused presence for ${job.data.to}`, err),
              );
            await new Promise((r) => setTimeout(r, result.pacingMs));
          }

          return result;
        });
      },
      {
        connection,
        concurrency: 1,
      }
    );

    worker.on("failed", async (job: Job<MessageJob> | undefined, err: Error) => {
      if (!job) return;
      const maxAttempts = (job.opts?.attempts as number | undefined) ?? 10;
      // Anti-ban blocks and fatal-classified errors already mark the message
      // FAILED and call job.discard() inline in processMessage — this
      // listener still fires for them, but attemptsMade may be well below
      // maxAttempts since discard() stops retries early. Skip the redundant
      // work in that case instead of waiting for a max-attempts count that
      // will never be reached.
      const isUnrecoverable = err?.name === "UnrecoverableError";
      if (isUnrecoverable || job.attemptsMade < maxAttempts) return;

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
                Logger.warn(
                  `[Worker:${companyId}] Could not mark message ${dbId} as FAILED (row not found or already removed): ${updateErr.message}`,
                );
              });
          },
        );
        // Without this, a permanently-failed send left the agent's UI showing
        // the optimistic "queued" state forever — the DB row was correctly
        // FAILED, but nothing ever told the frontend.
        const ticketId = (metadata?.originalTicketId as string) || undefined;
        this.socketEmitter.emitMessageStatus(
          dbId,
          job.data.conversationId,
          companyId,
          "failed",
          ticketId,
        );
      } catch (ctxErr) {
        Logger.error(
          `[Worker:${companyId}] Context error when marking message ${dbId} as FAILED:`,
          ctxErr,
        );
      }
    });

    this.activeWorkers.set(companyId, worker);
    Logger.info(`[Worker:${companyId}] Started (sequential, concurrency 1 for strict ordering)`);
  }

  /** Mark the DB row FAILED and notify the frontend via socket — shared by
   * every non-retryable failure path (anti-ban block, fatal-classified error). */
  private async failFast(
    job: Job<MessageJob>,
    companyId: string,
    conversationId: string,
  ): Promise<void> {
    const metadata = job.data.metadata as Record<string, unknown> | undefined;
    const dbId = metadata?.dbId as string | undefined;
    if (!dbId) return;

    await messageRepository
      .update(dbId, { status: "FAILED" }, companyId)
      .catch((e: Error) =>
        Logger.warn(`[Worker] Could not mark ${dbId} FAILED: ${e.message}`),
      );
    const ticketId = (metadata?.originalTicketId as string) || undefined;
    this.socketEmitter.emitMessageStatus(dbId, conversationId, companyId, "failed", ticketId);
  }

  private async processMessage(job: Job<MessageJob>): Promise<WorkerResult> {
    const { companyId, conversationId, senderId, to, text, media, quotedMessageId } = job.data;

    const metadata = job.data.metadata as Record<string, string | number | boolean | null> | undefined;
    const dbId = metadata?.dbId as string | undefined;

    try {
      await job.updateProgress(10);
      Logger.info(
        `[Worker] Processing job ${job.id}: ${to} (${media?.type || "text"})`,
      );

      if (dbId) {
        const ticketId = (metadata?.originalTicketId as string) || undefined;
        this.socketEmitter.emitMessageStatus(dbId, conversationId, companyId, "sending", ticketId);
      }

      await this.waitForSession(companyId);
      await job.updateProgress(30);

      let uploadedMedia = media;
      if (media && media.url.startsWith("data:")) {
        await job.updateProgress(40);
        uploadedMedia = await this.uploadMediaToS3(companyId, media);
        await job.updateProgress(60);
      }

      if (dbId) {
        const existingMessage = await messageRepository.findUnique({ where: { id: dbId } });
        if (existingMessage && ["SENT", "DELIVERED", "READ"].includes(existingMessage.status)) {
          Logger.warn(`[Worker] Job ${job.id} skipped - Message ${dbId} already marked as ${existingMessage.status}`);
          return { success: true, messageId: existingMessage.whatsappMessageId || "", sentAt: new Date() };
        }
      }

      await job.updateProgress(40);
      const typingTime = Math.floor(Math.random() * (700 - 300 + 1) + 300);

      // Fire-and-forget: presence is a cosmetic "typing…" indicator, not
      // something the send needs to wait on. Awaiting it added a full extra
      // HTTP round-trip to whatsapp-service per message before the actual
      // send even started.
      this.whatsappService
        .sendPresenceUpdate(to, "composing", companyId)
        .catch((err) => Logger.warn(`[Worker] Failed to emit composing presence for ${to}`, err));
      await new Promise((r) => setTimeout(r, typingTime));

      await job.updateProgress(70);

      // sessionId isn't used by executeQueuedMessage's request body (only in
      // its error log) — the getSessions() HTTP round-trip to look it up was
      // pure overhead on every single send.
      const result = await this.whatsappService.executeQueuedMessage(
        "",
        to,
        text,
        {
          companyId,
          conversationId,
          senderId,
          metadata: metadata as Record<string, string | number | boolean | null> | undefined,
          dbId,
          media: uploadedMedia,
          quotedMessageId,
        },
      );

      await job.updateProgress(100);

      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date(),
        pacingMs: Math.floor(Math.random() * (800 - 300 + 1) + 300),
      };
    } catch (error: unknown) {
      const isError = error instanceof Error;
      const errMsg = isError ? error.message : String(error);

      if (isAntiBanBlock(errMsg)) {
        Logger.warn(
          `[Worker] Job ${job.id} blocked by anti-ban protection (no retries): ${errMsg}`,
        );
        await this.failFast(job, companyId, conversationId);
        await job.discard();
        throw error;
      }

      if (isFatalError(error)) {
        Logger.warn(
          `[Worker] Job ${job.id} failed with a non-retryable error, skipping remaining attempts: ${errMsg}`,
        );
        await this.failFast(job, companyId, conversationId);
        throw new UnrecoverableError(errMsg);
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
      throw error;
    }
  }

  private async waitForSession(companyId: string): Promise<void> {
    // [PERF] Was a fixed 30s / 500ms-interval poll — with only 3 job attempts
    // now (down from 10), a single stuck poll no longer needs 30s of budget
    // to give a reconnect a fair chance across retries. 15s covers a normal
    // deploy-triggered reconnect window (see CLAUDE.md) while capping how
    // long one job can hog the company's concurrency-1 worker. The growing
    // interval backs off DB/query pressure if the outage runs long, while
    // still checking fast when the session comes back quickly.
    const maxWait = 15000;
    const startTime = Date.now();
    let interval = 500;

    while (Date.now() - startTime < maxWait) {
      const isConnected =
        await this.whatsappService.isCompanyConnected(companyId);

      if (isConnected) {
        Logger.info(`[Worker] Session ready for ${companyId}`);
        return;
      }

      await new Promise((r) => setTimeout(r, interval));
      interval = Math.min(interval * 2, 2000);
    }

    throw new Error(`Session not ready after ${maxWait}ms`);
  }

  /**
   * Fallback safety net: the primary upload now happens in
   * WhatsAppMessaging.sendMessage() before the job is even enqueued, so this
   * should be a no-op in the common case. Kept here for any caller that
   * enqueues a job directly with an unresolved base64 payload — better to
   * pay the upload cost here than to send a `data:` URL to whatsapp-service.
   */
  private async uploadMediaToS3(
    companyId: string,
    media: MediaPayload,
  ): Promise<MediaPayload> {
    const uploaded = await uploadBase64MediaToS3(companyId, media);
    return uploaded ?? media;
  }

  async stopWorker(companyId: string): Promise<void> {
    return this.withWorkerLock(companyId, () => this.stopWorkerLocked(companyId));
  }

  private async stopWorkerLocked(companyId: string): Promise<void> {
    const worker = this.activeWorkers.get(companyId);
    if (worker) {
      await worker.close();
      this.activeWorkers.delete(companyId);
    }
    Logger.info(`[Worker:${companyId}] Stopped`);
  }

  async shutdown(): Promise<void> {
    Logger.info("[Worker] Shutting down all workers...");
    for (const [companyId, worker] of this.activeWorkers.entries()) {
      await worker.close();
      Logger.info(`[Worker:${companyId}] Closed`);
    }
    this.activeWorkers.clear();
  }
}

let workerInstance: MessageQueueWorker;

export function getMessageQueueWorker(
  whatsappService: WhatsAppService,
): MessageQueueWorker {
  if (!workerInstance) {
    workerInstance = new MessageQueueWorker(whatsappService);
  }
  return workerInstance;
}
