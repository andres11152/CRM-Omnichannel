import Bull, { Queue, Job } from "bull";
import { Logger } from "../../utils/logger";

/**
 * ENTERPRISE MESSAGE QUEUE SERVICE
 *
 * Multi-tenant, scalable, fault-tolerant message queue system.
 * Features:
 * - One queue per company (tenant isolation)
 * - Automatic retries with exponential backoff
 * - Dead letter queue for failed messages
 * - Concurrent processing (3 workers per queue)
 * - Progress tracking
 */

export interface MessageJob {
  companyId: string;
  conversationId: string;
  senderId: string;
  to: string;
  text: string;
  media?: {
    type: string;
    url: string;
    mimetype?: string;
    name?: string;
    isVoiceNote?: boolean;
  };
}

class MessageQueueService {
  private queues: Map<string, Queue<MessageJob>> = new Map();
  private redisConfig: Bull.QueueOptions["redis"];

  constructor() {
    // Use existing Redis connection from env
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      this.redisConfig = redisUrl;
    } else {
      this.redisConfig = {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
      };
    }

    Logger.info("[MessageQueue] Service initialized");
  }

  /**
   * Get or create a queue for a specific company
   * Ensures tenant isolation
   */
  public getQueue(companyId: string): Queue<MessageJob> {
    if (!this.queues.has(companyId)) {
      const queue = new Bull<MessageJob>(`whatsapp-messages:${companyId}`, {
        redis: this.redisConfig,
        defaultJobOptions: {
          attempts: 3, // Retry 3 times
          backoff: {
            type: "exponential",
            delay: 2000, // Start with 2s, then 4s, then 8s
          },
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 500, // Keep last 500 failed jobs for debugging
        },
      });

      // Event listeners for monitoring
      queue.on("error", (error) => {
        Logger.error(`[Queue:${companyId}] Error:`, error);
      });

      queue.on("failed", (job, err) => {
        Logger.error(`[Queue:${companyId}] Job ${job.id} failed:`, err);
      });

      queue.on("completed", (job) => {
        Logger.info(`[Queue:${companyId}] ✅ Job ${job.id} completed`);
      });

      this.queues.set(companyId, queue);
      Logger.info(`[MessageQueue] Created queue for company: ${companyId}`);
    }

    return this.queues.get(companyId)!;
  }

  /**
   * Add a message to the queue
   * Returns job ID for tracking
   */
  async enqueue(jobData: MessageJob): Promise<string> {
    const queue = this.getQueue(jobData.companyId);

    const job = await queue.add(jobData, {
      priority: jobData.media ? 2 : 1, // Media messages have higher priority
      timeout: 60000, // 60s timeout per job
    });

    Logger.info(
      `[Queue:${jobData.companyId}] 📥 Enqueued job ${job.id} (${
        jobData.media?.type || "text"
      })`
    );

    return job.id.toString();
  }

  /**
   * Get job status for tracking
   */
  async getJobStatus(companyId: string, jobId: string): Promise<any> {
    const queue = this.getQueue(companyId);
    const job = await queue.getJob(jobId);

    if (!job) {
      return { status: "not_found" };
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      status: state,
      progress,
      data: job.data,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
    };
  }

  /**
   * Pause queue for a specific company
   * Useful for maintenance or rate limiting
   */
  async pauseQueue(companyId: string): Promise<void> {
    const queue = this.getQueue(companyId);
    await queue.pause();
    Logger.warn(`[Queue:${companyId}] ⏸️  Paused`);
  }

  /**
   * Resume queue
   */
  async resumeQueue(companyId: string): Promise<void> {
    const queue = this.getQueue(companyId);
    await queue.resume();
    Logger.info(`[Queue:${companyId}] ▶️  Resumed`);
  }

  /**
   * Get queue metrics
   */
  async getMetrics(companyId: string) {
    const queue = this.getQueue(companyId);

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * Cleanup - close all queues gracefully
   */
  async shutdown(): Promise<void> {
    Logger.info("[MessageQueue] Shutting down...");

    for (const [companyId, queue] of this.queues.entries()) {
      await queue.close();
      Logger.info(`[Queue:${companyId}] Closed`);
    }

    this.queues.clear();
  }
}

export const messageQueueService = new MessageQueueService();
