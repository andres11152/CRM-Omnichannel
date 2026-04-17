import { Job } from "bull";
import { MessageJob, messageQueueService } from "./messageQueueService";
import { WhatsAppService } from "@/whatsapp/WhatsAppService";
import { messageRepository } from "@/repositories/MessageRepository";
import { Logger } from "../../utils/logger";
import { MediaPayload } from "@/whatsapp/core/types/whatsapp.types";
import { DistributedLock } from "@/utils/distributedLock";
import { contextStorage } from "@/context/requestContext";

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

  constructor(whatsappService: WhatsAppService) {
    this.whatsappService = whatsappService;
  }

  /**
   * Start worker for a specific company
   * Creates 3 concurrent workers per company
   */
  async startWorker(companyId: string): Promise<void> {
    if (this.activeWorkers.has(companyId)) {
      Logger.warn(`[Worker:${companyId}] Already running`);
      return;
    }

    const queue = messageQueueService.getQueue(companyId);

    queue.process(3, async (job: Job<MessageJob>) => {
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
          10000, // TTL 10s (if process crashes)
          30000  // Wait up to 30s for previous message to finish
        );
      });
    });

    this.activeWorkers.set(companyId, true);
    Logger.info(`[Worker:${companyId}]  Started (3 concurrent workers)`);
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

      // 3. [AI] HUMAN-LIKE BEHAVIOR: Simulate typing & Random delay
      await job.progress(40);
      const typingTime = Math.floor(Math.random() * (3000 - 1500 + 1) + 1500); // 1.5 - 3s

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

      // 5. POST-SEND COOL-DOWN (Random 2-5s)
      const cooldown = Math.floor(Math.random() * (5000 - 2000 + 1) + 2000);
      await new Promise((r) => setTimeout(r, cooldown));

      await job.progress(100);

      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date(),
      };
    } catch (error: unknown) {
      const isError = error instanceof Error;
      Logger.error(
        `[Worker] Job ${job.id} failed for CompanyId: ${companyId}`,
        {
          companyId,
          conversationId,
          to,
          error: isError ? error.message : String(error),
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
