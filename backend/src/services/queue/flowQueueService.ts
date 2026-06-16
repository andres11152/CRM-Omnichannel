import { Queue } from "bullmq";
import { connection } from "@/config/bullmq";
import { Logger } from "@/utils/logger";

const QUEUE_NAME = "flow-execution-queue";

/**
 * Service to manage Flow Execution Queue (Producer)
 * Handles scheduling of delayed flow steps.
 */
export class FlowQueueService {
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  /**
   * Schedule a session resumption after a delay
   * @param sessionId The session ID to resume
   * @param delayMs Delay in milliseconds
   */
  async scheduleResume(sessionId: string, delayMs: number): Promise<void> {
    // Add job with delay
    await this.queue.add(
      "resume-flow",
      { sessionId },
      {
        delay: delayMs,
        jobId: `resume-${sessionId}-${Date.now()}`, // Unique job ID prevents dups if needed, but timestamp ensures uniqueness here
        removeOnComplete: true, // Keep Redis clean
        removeOnFail: 100, // Keep last 100 failed for debugging
      },
    );
    Logger.info(
      `[FlowQueue] Scheduled resume for session ${sessionId} in ${delayMs}ms`,
    );
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    await this.queue.close();
  }
}

export const flowQueueService = new FlowQueueService();
