import { Queue, Worker, Job } from "bullmq";
import { connection } from "@/config/bullmq";
import { whatsappService } from "@/whatsapp";
import { Logger } from "@/utils/logger";
import { prisma } from "@/config/database";
import { TenantContextManager } from "@/config/tenantContext";
import { SendMessageOptions } from "../core/types/whatsapp.types";

export const OUTBOUND_QUEUE_NAME = "wa-outbound";

class WhatsAppQueueManager {
  private queue: Queue;
  private worker: Worker;

  constructor() {
    this.queue = new Queue(OUTBOUND_QUEUE_NAME, { connection });

    this.worker = new Worker(
      OUTBOUND_QUEUE_NAME,
      async (job) => {
        await this.processJob(job);
      },
      {
        connection,
        concurrency: 5, // Limit concurrent processing per instance
      },
    );

    this.worker.on("failed", (job, err) => {
      Logger.error(`[Queue] Job ${job?.id} failed:`, err);
    });

    this.worker.on("completed", (_job) => {
      // Logger.info(`[Queue] Job ${_job.id} completed`);
    });
  }

  async addMessage(data: {
    sessionId: string;
    to: string;
    content: string;
    options: SendMessageOptions;
    priority?: "high" | "normal" | "low";
  }) {
    const { sessionId, priority } = data;

    // 1. Calculate Reputation / Age
    // New sessions (< 24h) get harsher delays
    const session = await prisma.whatsAppSession.findUnique({
      where: { sessionId },
      select: { createdAt: true },
    });

    let delay = 0;
    if (session) {
      const ageHours = (Date.now() - session.createdAt.getTime()) / 3600000;
      if (ageHours < 24) {
        // New Account Protection: Add forced delay to queue processing
        // This is on top of the worker jitter
        delay = 5000;
      }
    }

    // 2. Map Priority
    // BullMQ: Lower number = Higher priority
    // High (Chat) = 1
    // Normal = 10
    // Low (Campaign) = 50
    let numericPriority = 10;
    if (priority === "high") numericPriority = 1;
    if (priority === "low") numericPriority = 50;

    return this.queue.add("send-message", data, {
      priority: numericPriority,
      delay,
      removeOnComplete: true, // Keep clean
      removeOnFail: 50, // Inspect failures
    });
  }

  private async processJob(job: Job) {
    const { sessionId, to, content, options } = job.data;

    // 🛡️ 100-YEAR FIX: Extract companyId from options for tenant context
    const companyId = options.companyId;
    if (!companyId) {
      Logger.error(`[Queue] Job ${job.id} missing companyId in options`);
      throw new Error("Missing companyId in queue job");
    }

    // 🛡️ CRITICAL: Wrap all DB operations in TenantContext
    await TenantContextManager.run(
      { companyId, userId: "queue-worker", requestId: `job:${job.id}` },
      async () => {
        try {
          // 1. Human-Like Behavior: Random Jitter (3s - 8s)
          const jitter = Math.floor(Math.random() * 5000) + 3000;
          await new Promise((resolve) => setTimeout(resolve, jitter));

          // 2. Simulate Typing (Human Interaction)
          if (!options.media) {
            await whatsappService.simulateTyping(sessionId, to);
            const typingDuration = Math.min(
              Math.max(content.length * 50, 1000),
              4000,
            );
            await new Promise((resolve) => setTimeout(resolve, typingDuration));
          }

          // 3. Execute Send
          await whatsappService.executeQueuedMessage(
            sessionId,
            to,
            content,
            options,
          );
        } catch (error) {
          Logger.error(
            `[Worker] Failed to send message for ${sessionId}`,
            error,
          );
          throw error; // Trigger retry
        }
      },
    );
  }
}

export const whatsappQueue = new WhatsAppQueueManager();
