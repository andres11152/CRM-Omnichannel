import { Worker, Job } from "bullmq";
import { messageRepository } from "@/repositories/MessageRepository";
import { Logger } from "@/utils/logger";
import { contextStorage } from "@/context/requestContext";
import { gateway } from "@/gateways/socketGateway";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { connection } from "@/config/bullmq";

interface CallbackJobData {
  success: boolean;
  companyId: string;
  sessionId: string;
  messageId?: string;
  dbMessageId?: string;
  /** Threaded through from whatsapp-service's OutboundWorker so the frontend
   * can route the status update to the right conversation's cache without a
   * DB round-trip. Absent for jobs enqueued before this field existed —
   * those fall back to the updated row's own conversationId (success path
   * only; the failure path has no row to read it from). */
  conversationId?: string;
  error?: string;
  to?: string;
}

export class OutboundCallbackWorker {
  private worker: Worker;
  private socketEmitter = new SocketEventEmitter(gateway);

  constructor() {
    this.worker = new Worker(
      "whatsapp-outbound-callback",
      async (job: Job<CallbackJobData>) => {
        const { success, companyId, messageId, dbMessageId, conversationId, error } = job.data;

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

              const resolvedConversationId = conversationId || updated.conversationId;
              if (resolvedConversationId) {
                this.socketEmitter.emitMessageStatus(dbMessageId, resolvedConversationId, companyId, "sent");
              } else {
                Logger.warn(`[OutboundCallbackWorker] No conversationId for message ${dbMessageId}, cannot notify frontend`);
              }
            } else {
              await messageRepository.update(dbMessageId, {
                status: "FAILED",
              }, companyId).catch(() => {});

              if (conversationId) {
                this.socketEmitter.emitMessageStatus(dbMessageId, conversationId, companyId, "failed");
              } else {
                Logger.warn(`[OutboundCallbackWorker] No conversationId for failed message ${dbMessageId}, cannot notify frontend`);
              }

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
        // [ENTERPRISE · CRITICAL] Was `redisClient` from "@/config/redis" — the
        // `redis` npm package's client, not ioredis. It duck-types past
        // BullMQ's connection check (has connect/disconnect/duplicate), so
        // construction never threw, but the worker's actual read loop needs
        // ioredis-only APIs and silently never consumed a single job —
        // confirmed empirically (a job enqueued via a real ioredis-backed
        // Queue never leaves "waiting" with a `redis`-client-backed Worker,
        // no error/failed event ever fires). This means the AI/flow-triggered
        // outbound send path's status callbacks (SENT/FAILED + socket event)
        // have never actually been processed. Use the shared ioredis
        // connection, same as the (working) messageQueueWorker.
        connection,
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
