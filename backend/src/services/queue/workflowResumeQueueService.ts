import { Queue } from "bullmq";
import { connection } from "@/config/bullmq";
import { Logger } from "@/utils/logger";

const QUEUE_NAME = "workflow-resume-queue";

/**
 * Producer side of the CRM WorkflowEngine's "delay" node: schedules a
 * BullMQ job that resumes a paused WorkflowExecution after a set duration,
 * so a pause survives a redeploy instead of dying with the process (the
 * WorkflowEngine itself is stateless/in-process — this queue is what makes
 * a multi-day "wait 3 days" step actually durable).
 */
export class WorkflowResumeQueueService {
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async scheduleResume(executionId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      "resume-workflow",
      { executionId },
      {
        delay: delayMs,
        jobId: `resume-${executionId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    Logger.info(
      `[WorkflowResumeQueue] Scheduled resume for execution ${executionId} in ${delayMs}ms`,
    );
  }

  async shutdown(): Promise<void> {
    await this.queue.close();
  }
}

export const workflowResumeQueueService = new WorkflowResumeQueueService();
