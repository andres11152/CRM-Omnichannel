import { Worker, Job } from "bullmq";
import { connection } from "@/config/bullmq";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { workflowExecutionRepository } from "@/repositories/WorkflowExecutionRepository";

const QUEUE_NAME = "workflow-resume-queue";

/**
 * Consumer side of the CRM WorkflowEngine's "delay" node — picks up a
 * scheduled resume job and re-enters the graph walk where it left off.
 */
class WorkflowResumeQueueWorker {
  private worker: Worker | null = null;

  startWorker() {
    if (this.worker) return;

    Logger.info(`[WorkflowResumeWorker] Starting worker for queue: ${QUEUE_NAME}`);

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name !== "resume-workflow") return;
        const { executionId } = job.data;

        // Company context isn't known until we've read the (system-scoped)
        // execution row itself, mirroring flowQueueWorker's session lookup.
        const execution = await TenantContextManager.runAsSystem(() =>
          workflowExecutionRepository.findById(executionId),
        );

        if (!execution) {
          Logger.warn(`[WorkflowResumeWorker] Execution ${executionId} not found`);
          return;
        }
        if (!execution.companyId) {
          Logger.warn(`[WorkflowResumeWorker] Execution ${executionId} has no companyId`);
          return;
        }

        await TenantContextManager.run(
          {
            companyId: execution.companyId,
            userId: "system",
            role: "SYSTEM",
            requestId: `workflow-resume-${job.id}`,
          },
          async () => {
            const { workflowEngine } = await import("@/services/WorkflowEngine");
            await workflowEngine.resumeExecution(executionId);
          },
        );
      },
      {
        connection,
        concurrency: 5,
      },
    );

    this.worker.on("failed", (job, err) => {
      Logger.error(`[WorkflowResumeWorker] Job ${job?.id} failed:`, err);
    });
  }

  async shutdown() {
    if (this.worker) {
      Logger.info(`[WorkflowResumeWorker] Shutting down worker...`);
      await this.worker.close();
    }
  }
}

export const workflowResumeQueueWorker = new WorkflowResumeQueueWorker();
