import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { getEnv } from "@/config/env";
import { Logger } from "@/utils/logger";
import { WAMessage } from "@whiskeysockets/baileys";
import { InboundMessageHandler } from "../../providers/handlers/InboundMessageHandler";
import { runWithCompanyId } from "@/context/requestContext";

/**
 *  INBOUND WORKER
 * 
 * Processes raw WhatsApp messages from the queue.
 * - Mutex Locks
 * - Identity Resolution (LID/Phone)
 * - Message Persistence (DB)
 * - AI Triggering
 * - Workflow Activation
 */
export class InboundWorker {
  private worker: Worker;

  constructor(
    private inboundHandler: InboundMessageHandler,
  ) {
    const env = getEnv();
    const redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      password: env.REDIS_PASSWORD || undefined,
    });

    this.worker = new Worker(
      "whatsapp-inbound",
      async (job: Job) => {
        const { message, sessionId, companyId } = job.data as {
          message: WAMessage;
          sessionId: string;
          companyId: string;
        };

        try {
          Logger.debug(`[InboundWorker]  [${companyId}] Processing message ${message.key.id} for session ${sessionId}`);

          // [SEC] SECURITY: Inject company context for the RLS interceptor
          // Background jobs don't have middleware context, so we set it manually from the Job data
          await runWithCompanyId(companyId, async () => {
            //  Delegate to established InboundMessageHandler
            await this.inboundHandler.handleIncoming(message, sessionId);
          });

          Logger.info(`[InboundWorker] [OK] Message ${message.key.id} processed successfully`);
        } catch (error) {
          Logger.error(`[InboundWorker] [ERROR] Failed to process message ${message.key.id}: ${error instanceof Error ? error.message : error}`);
          throw error; // Let BullMQ handle the retry
        }
      },
      { 
        connection: redis,
        concurrency: 10, 
      }
    );

    this.setupListeners();
  }

  private setupListeners() {
    this.worker.on("completed", (job) => {
      Logger.debug(`[InboundWorker] Job ${job.id} completed.`);
    });

    this.worker.on("failed", (job, err) => {
      Logger.error(`[InboundWorker] Job ${job?.id} failed: ${err.message}`);
    });
  }

  public async close() {
    await this.worker.close();
  }
}
