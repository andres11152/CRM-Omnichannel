import { Queue, Worker, QueueEvents, Job } from "bullmq";
import { Redis } from "ioredis";
import { whatsappService } from "@/whatsapp";
import { prisma } from "@/config/database";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

interface SessionInitJob {
  sessionId: string;
  companyId: string;
  authDir: string;
}

/**
 * SESSION INITIALIZATION QUEUE
 *
 * Replaces the linear, blocking startup loop with a worker pool.
 * Initializes WhatsApp sessions asynchronously with:
 * - Concurrency control (max 5 sessions initializing simultaneously)
 * - Retry strategy (3 attempts with exponential backoff)
 * - Priority-based processing (enterprise customers first)
 * - Memory-efficient streaming (no array accumulation)
 */
export class SessionInitializationQueue {
  private queue: Queue<SessionInitJob>;
  private worker: Worker<SessionInitJob>;
  private queueEvents: QueueEvents;
  private connection: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    // Single Redis connection for all BullMQ components
    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.queue = new Queue<SessionInitJob>("session-initialization", {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // Start at 5s, double each retry
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    });

    this.queueEvents = new QueueEvents("session-initialization", {
      connection: this.connection,
    });

    // Setup worker with concurrency control
    this.worker = new Worker<SessionInitJob>(
      "session-initialization",
      async (job: Job<SessionInitJob>) => {
        return this.processSessionInit(job);
      },
      {
        connection: this.connection,
        concurrency: 5, // Max 5 sessions initializing simultaneously
        limiter: {
          max: 10, // Max 10 jobs per duration
          duration: 60000, // 1 minute window
        },
      },
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.worker.on("completed", (job) => {
      logger.info(
        { jobId: job.id, sessionId: job.data.sessionId },
        "[SessionQueue] Job completed",
      );
    });

    this.worker.on("failed", (job, err) => {
      logger.error(
        {
          jobId: job?.id,
          sessionId: job?.data?.sessionId,
          error: err.message,
          attempts: job?.attemptsMade,
        },
        "[SessionQueue] Job failed",
      );
    });

    this.worker.on("error", (err) => {
      logger.error({ error: err.message }, "[SessionQueue] Worker error");
    });

    this.queueEvents.on("completed", ({ jobId }) => {
      logger.debug({ jobId }, "[SessionQueue] Event: Job completed");
    });
  }

  private async processSessionInit(job: Job<SessionInitJob>): Promise<void> {
    const { sessionId, companyId, authDir } = job.data;

    logger.info(
      { sessionId, companyId, attempt: job.attemptsMade },
      "[SessionQueue] Initializing session",
    );

    try {
      await whatsappService.createSession(companyId, sessionId);

      // Update job progress
      await job.updateProgress(100);

      logger.info(
        { sessionId },
        "[SessionQueue] Session initialized successfully",
      );
    } catch (error: any) {
      logger.error(
        { sessionId, error: error.message },
        "[SessionQueue] Failed to initialize session",
      );
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Queue sessions from database using STREAMING (not array accumulation)
   */
  async queueAllActiveSessions(): Promise<void> {
    logger.info("[SessionQueue] Starting session queuing from database");

    let processed = 0;
    let queued = 0;
    const batchSize = 100;

    try {
      // STREAMING APPROACH: Process in batches to avoid loading all companies into memory
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        // Fetch batch using cursor pagination
        const sessions = await prisma.whatsAppSession.findMany({
          where: {
            status: { in: ["CONNECTED", "SCANNING"] },
          },
          take: batchSize,
          skip: cursor ? 1 : 0,
          cursor: cursor ? { sessionId: cursor } : undefined,
          orderBy: { sessionId: "asc" },
          include: {
            company: {
              select: {
                id: true,
                planId: true, // For priority
              },
            },
          },
        });

        processed += sessions.length;
        hasMore = sessions.length === batchSize;

        if (sessions.length > 0) {
          cursor = sessions[sessions.length - 1].sessionId;

          // Add jobs to queue (non-blocking)
          const jobPromises = sessions.map((session) => {
            const priority = this.calculatePriority(session.company.planId);

            return this.queue.add(
              "init-session",
              {
                sessionId: session.sessionId,
                companyId: session.companyId,
                authDir: `./wa_sessions/${session.sessionId}`,
              },
              {
                priority, // Enterprise customers first
                jobId: `session-${session.sessionId}`, // Idempotency
              },
            );
          });

          // Wait for batch to be queued (but not processed)
          await Promise.all(jobPromises);
          queued += sessions.length;

          logger.info(
            { processed, queued },
            `[SessionQueue] Batch processed: ${sessions.length} sessions`,
          );
        }
      }

      logger.info(
        { totalProcessed: processed, totalQueued: queued },
        "[SessionQueue] All sessions queued successfully",
      );
    } catch (error: any) {
      logger.error(
        { error: error.message },
        "[SessionQueue] Error queuing sessions",
      );
      throw error;
    }
  }

  /**
   * Calculate job priority based on plan
   * Lower number = higher priority
   */
  private calculatePriority(planId: string | null): number {
    if (!planId) return 10; // Default priority

    // Enterprise plans get higher priority
    if (planId.includes("enterprise")) return 1;
    if (planId.includes("professional")) return 5;
    return 10; // Free/Basic
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info("[SessionQueue] Shutting down gracefully");

    await this.worker.close();
    await this.queue.close();
    await this.queueEvents.close();
    await this.connection.quit();

    logger.info("[SessionQueue] Shutdown complete");
  }
}

// Singleton instance
export const sessionInitQueue = new SessionInitializationQueue();
