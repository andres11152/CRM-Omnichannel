import { Worker, Job } from "bullmq";
import { messageRepository } from "@/repositories/MessageRepository";
import { Logger } from "@/utils/logger";
import { contextStorage } from "@/context/requestContext";
import { gateway } from "@/gateways/socketGateway";
import redisClient from "@/config/redis";

interface CallbackJobData {
  success: boolean;
  companyId: string;
  sessionId: string;
  messageId?: string;
  dbMessageId?: string;
  error?: string;
  to?: string;
}

export class OutboundCallbackWorker {
  private worker: Worker;

  constructor() {
    if (!redisClient) {
      throw new Error("[OutboundCallbackWorker] Redis client not initialized");
    }

    this.worker = new Worker(
      "whatsapp-outbound-callback",
      async (job: Job<CallbackJobData>) => {
        const { success, companyId, messageId, dbMessageId, error } = job.data;

        if (!dbMessageId) {
          Logger.warn(`[OutboundCallbackWorker] Job ${job.id} received callback without dbMessageId, skipping.`);
          return;
        }

        Logger.info(
          `[OutboundCallbackWorker] Processing callback for message ${dbMessageId}: success=${success}`
        );

        await contextStorage.run({ companyId, requestId: `outbound-callback:${job.id}` }, async () => {
          try {
            if (success) {
              const updated = await messageRepository.update(dbMessageId, {
                status: "SENT",
                whatsappMessageId: messageId || null,
              }, companyId);

              gateway.emitToCompany(companyId, "message:status", {
                id: dbMessageId,
                status: "SENT",
                whatsappMessageId: messageId,
                sentAt: updated.updatedAt,
              });
            } else {
              await messageRepository.update(dbMessageId, {
                status: "FAILED",
              }, companyId).catch(() => {});

              gateway.emitToCompany(companyId, "message:status", {
                id: dbMessageId,
                status: "FAILED",
              });

              Logger.warn(`[OutboundCallbackWorker] Marked message ${dbMessageId} as FAILED. Reason: ${error}`);
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            Logger.error(`[OutboundCallbackWorker] Failed to process callback for ${dbMessageId}: ${errMsg}`);
            throw err;
          }
        });
      },
      {
        connection: redisClient as unknown as import("ioredis").Redis,
        concurrency: 5,
      }
    );

    this.worker.on("ready", () => {
      Logger.info("[OutboundCallbackWorker] Ready and listening for outbound callbacks");
    });
  }

  async shutdown(): Promise<void> {
    await this.worker.close();
  }
}
