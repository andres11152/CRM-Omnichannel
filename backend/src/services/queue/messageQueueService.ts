import { Queue, Job } from "bullmq";
import { connection } from "@/config/bullmq";
import { Logger } from "../../utils/logger";
import { SendMessageOptions } from "../../whatsapp/core/types/whatsapp.types";

/**
 * ENTERPRISE MESSAGE QUEUE SERVICE (Scale-Optimized with BullMQ)
 *
 * Multi-tenant, scalable, fault-tolerant message queue system.
 * 
 * Features:
 * - One queue per company (tenant isolation)
 * - Shared Redis connection (using connection from config/bullmq)
 * - Idle queue eviction to prevent memory leaks
 * - Automatic retries with exponential backoff
 */

export interface MessageJob extends SendMessageOptions {
  companyId: string;
  conversationId: string;
  senderId: string;
  to: string;
  text: string;
}

export interface JobStatusResponse {
  status: string | "not_found";
  progress?: unknown;
  data?: MessageJob;
  failedReason?: string;
  finishedOn?: number; // timestamp
}

const IDLE_QUEUE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface QueueEntry {
  queue: Queue<MessageJob>;
  lastUsed: number;
}

class MessageQueueService {
  private queues: Map<string, QueueEntry> = new Map();
  private evictionInterval: NodeJS.Timeout | null = null;
  private evictionListeners: Array<(companyId: string) => void> = [];

  constructor() {
    this.startEvictionLoop();
    Logger.info("[MessageQueue] Service initialized (BullMQ shared connection mode)");
  }

  public onQueueEvicted(listener: (companyId: string) => void): void {
    this.evictionListeners.push(listener);
  }

  private startEvictionLoop(): void {
    this.evictionInterval = setInterval(() => {
      void this.evictIdleQueues();
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  private async evictIdleQueues(): Promise<void> {
    const now = Date.now();
    const evicted: string[] = [];

    for (const [companyId, entry] of this.queues.entries()) {
      if (now - entry.lastUsed <= IDLE_QUEUE_TTL_MS) continue;

      try {
        const counts = await entry.queue.getJobCounts();
        const pending =
          (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);
        if (pending > 0) {
          entry.lastUsed = now; // Still busy — reset the idle clock
          continue;
        }
      } catch {
        continue;
      }

      entry.queue.close().catch(() => {});
      this.queues.delete(companyId);
      evicted.push(companyId);
    }

    if (evicted.length > 0) {
      Logger.info(
        `[MessageQueue] [CLEAN] Evicted ${evicted.length} idle queues: ${evicted.join(", ")}`,
      );
      for (const companyId of evicted) {
        for (const listener of this.evictionListeners) {
          try {
            listener(companyId);
          } catch (err) {
            Logger.warn(`[MessageQueue] Eviction listener failed for ${companyId}:`, err);
          }
        }
      }
    }
  }

  /**
   * Get or create a queue for a specific company.
   * Reuses the shared connection to optimize resource usage.
   */
  public getQueue(companyId: string): Queue<MessageJob> {
    const existing = this.queues.get(companyId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.queue;
    }

    const defaultJobOptions = {
      attempts: 10,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: 1000,
    };

    const queue = new Queue<MessageJob>(`whatsapp-messages-${companyId}`, {
      connection,
      defaultJobOptions,
    });

    this.queues.set(companyId, { queue, lastUsed: Date.now() });
    Logger.info(`[MessageQueue] Created queue for company: ${companyId}`);

    return queue;
  }

  /**
   * Add a message to the queue
   */
  async enqueue(jobData: MessageJob): Promise<string> {
    const queue = this.getQueue(jobData.companyId);

    try {
      const { ensureWorkerForCompany } = await import("@/loaders/workerLoader");
      await ensureWorkerForCompany(jobData.companyId);
    } catch (err) {
      Logger.error(
        `[Queue:${jobData.companyId}] Failed to ensure worker before enqueue`,
        err as Error,
      );
    }

    const job = await queue.add("send-message", jobData);

    Logger.info(
      `[Queue:${jobData.companyId}] [ENQUEUE] Enqueued job ${job.id} (${
        jobData.media?.type || "text"
      })`,
    );

    return job.id ? job.id.toString() : "";
  }

  /**
   * Get job status for tracking
   */
  async getJobStatus(
    companyId: string,
    jobId: string,
  ): Promise<JobStatusResponse> {
    const queue = this.getQueue(companyId);
    const job = await queue.getJob(jobId);

    if (!job) {
      return { status: "not_found" };
    }

    const state = await job.getState();
    const progress = job.progress;

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
    Logger.info(`[Queue:${companyId}] [RESUME] Resumed`);
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
   * Get diagnostics for all active queues
   */
  getDiagnostics() {
    return {
      activeQueues: this.queues.size,
      sharedRedisConnected: connection.status === "ready",
      queues: Array.from(this.queues.entries()).map(([companyId, entry]) => ({
        companyId,
        idleMs: Date.now() - entry.lastUsed,
      })),
    };
  }

  /**
   * Cleanup - close all queues gracefully
   */
  async shutdown(): Promise<void> {
    Logger.info("[MessageQueue] Shutting down...");

    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
      this.evictionInterval = null;
    }

    for (const [companyId, entry] of this.queues.entries()) {
      await entry.queue.close();
      Logger.info(`[Queue:${companyId}] Closed`);
    }

    this.queues.clear();
    Logger.info("[MessageQueue] [OK] Shutdown complete");
  }
}

export const messageQueueService = new MessageQueueService();
