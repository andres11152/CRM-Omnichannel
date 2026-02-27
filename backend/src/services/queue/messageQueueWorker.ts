import { Job } from "bull";
import { MessageJob, messageQueueService } from "./messageQueueService";
import { WhatsAppService } from "@/whatsapp/WhatsAppService";
import { Logger } from "../../utils/logger";
import {
  MessagePayload,
  MediaPayload,
} from "@/whatsapp/core/types/whatsapp.types";

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

    // Process jobs with concurrency of 3
    queue.process(3, async (job: Job<MessageJob>) => {
      return this.processMessage(job);
    });

    this.activeWorkers.set(companyId, true);
    Logger.info(`[Worker:${companyId}] 🚀 Started (3 concurrent workers)`);
  }

  /**
   * Process a single message job
   */
  private async processMessage(job: Job<MessageJob>): Promise<WorkerResult> {
    const { companyId, conversationId, senderId, to, text, media } = job.data;

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
        uploadedMedia = await this.uploadMediaToS3(media);
        await job.progress(60);
      }

      // 4. Send via WhatsApp Service V2
      await job.progress(70);
      const result: MessagePayload = await this.whatsappService.sendMessage(
        to,
        text,
        {
          companyId,
          conversationId,
          senderId,
          media: uploadedMedia,
        },
      );

      await job.progress(100);

      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date(),
      };
    } catch (error: unknown) {
      Logger.error(`[Worker] Job ${job.id} failed:`, error);
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
    media: MediaPayload, // Use strictly typed MediaPayload
  ): Promise<MediaPayload> {
    if (!media) return media;

    const { storageService } = await import("../storageService");

    // Check if it's already a URL (not data URI)
    if (!media.url.startsWith("data:")) {
      return media;
    }

    const base64Data = media.url.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");

    const result = await storageService.uploadFile(
      buffer,
      media.filename || `${media.type}-${Date.now()}.webm`,
      media.mimetype || "application/octet-stream",
      false,
    );

    Logger.info(`[Worker] 📤 Media uploaded to S3: ${result.key}`);

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

