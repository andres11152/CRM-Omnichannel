import { Job, Worker } from "bullmq";
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

const isAntiBanBlock = (msg: string): boolean =>
  msg.includes("[baileys-antiban] Message blocked");

interface WorkerResult {
  success: boolean;
  messageId: string;
  sentAt: Date;
}

class MessageQueueWorker {
  private whatsappService: WhatsAppService;
  private activeWorkers: Map<string, Worker> = new Map();
  private socketEmitter = new SocketEventEmitter(gateway);

  constructor(whatsappService: WhatsAppService) {
    this.whatsappService = whatsappService;
    messageQueueService.onQueueEvicted(async (companyId) => {
      await this.stopWorker(companyId);
    });
  }

  async startWorker(companyId: string): Promise<void> {
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
        }, () => {
          const lockKey = `msg_proc:${job.data.conversationId}`;

          return DistributedLock.run(
            lockKey,
            () => this.processMessage(job),
            60000,
            90000
          );
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
      if (job.attemptsMade < maxAttempts) return;

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

  private async processMessage(job: Job<MessageJob>): Promise<WorkerResult> {
    const { companyId, conversationId, senderId, to, text, media, quotedMessageId } = job.data;

    try {
      await job.updateProgress(10);
      Logger.info(
        `[Worker] Processing job ${job.id}: ${to} (${media?.type || "text"})`,
      );

      await this.waitForSession(companyId);
      await job.updateProgress(30);

      let uploadedMedia = media;
      if (media && media.url.startsWith("data:")) {
        await job.updateProgress(40);
        uploadedMedia = await this.uploadMediaToS3(companyId, media);
        await job.updateProgress(60);
      }

      const metadata = job.data.metadata as Record<string, string | number | boolean | null> | undefined;
      const dbId = metadata?.dbId as string | undefined;

      if (dbId) {
        const existingMessage = await messageRepository.findUnique({ where: { id: dbId } });
        if (existingMessage && ["SENT", "DELIVERED", "READ"].includes(existingMessage.status)) {
          Logger.warn(`[Worker] Job ${job.id} skipped - Message ${dbId} already marked as ${existingMessage.status}`);
          return { success: true, messageId: existingMessage.whatsappMessageId || "", sentAt: new Date() };
        }
      }

      await job.updateProgress(40);
      const typingTime = Math.floor(Math.random() * (700 - 300 + 1) + 300);

      try {
        await this.whatsappService.sendPresenceUpdate(to, "composing", companyId);
      } catch (err) {
        Logger.warn(`[Worker] Failed to emit composing presence for ${to}`, err);
      }
      await new Promise((r) => setTimeout(r, typingTime));

      await job.updateProgress(70);

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
          dbId,
          media: uploadedMedia,
          quotedMessageId,
        },
      );

      try {
        await this.whatsappService.sendPresenceUpdate(to, "paused", companyId);
      } catch (err) {
        Logger.warn(`[Worker] Failed to emit paused presence for ${to}`, err);
      }

      const cooldown = Math.floor(Math.random() * (800 - 300 + 1) + 300);
      await new Promise((r) => setTimeout(r, cooldown));

      await job.updateProgress(100);

      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date(),
      };
    } catch (error: unknown) {
      const isError = error instanceof Error;
      const errMsg = isError ? error.message : String(error);

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
          const ticketId = (metadata?.originalTicketId as string) || undefined;
          this.socketEmitter.emitMessageStatus(
            dbId,
            conversationId,
            companyId,
            "failed",
            ticketId,
          );
        }

        await job.discard();
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
      throw error;
    }
  }

  private async waitForSession(companyId: string): Promise<void> {
    const maxWait = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const isConnected =
        await this.whatsappService.isCompanyConnected(companyId);

      if (isConnected) {
        Logger.info(`[Worker] Session ready for ${companyId}`);
        return;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error(`Session not ready after ${maxWait}ms`);
  }

  private async uploadMediaToS3(
    companyId: string,
    media: MediaPayload,
  ): Promise<MediaPayload> {
    if (!media) return media;

    const { storageService } = await import("../StorageService");

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

    Logger.info(`[Worker] Media uploaded to S3: ${result.key}`);

    return {
      ...media,
      url: result.url,
    };
  }

  async stopWorker(companyId: string): Promise<void> {
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
