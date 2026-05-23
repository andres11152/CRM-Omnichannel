import { Worker, Job } from "bullmq";
import { connection } from "@/config/bullmq";
import { Logger } from "@/utils/logger";
import { flowExecutor } from "@/services/FlowExecutor";
import { chatService } from "@/services/ChatService";
import { TenantContextManager } from "@/config/tenantContext";
import mime from "mime-types";
import { container } from "@/config/container";
import { WA_TOKENS } from "@/whatsapp/di/tokens";

const QUEUE_NAME = "flow-execution-queue";

/**
 * Worker to process Flow Execution Jobs (Consumer)
 */
class FlowQueueWorker {
  private worker: Worker | null = null;

  /**
   * Start the worker to process delayed flows
   */
  startWorker() {
    if (this.worker) return;

    Logger.info(`[FlowWorker] Starting worker for queue: ${QUEUE_NAME}`);

    const messageHandler = container.resolve(WA_TOKENS.MessageHandler);

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name === "resume-flow") {
          const { sessionId } = job.data;
          Logger.info(`[FlowWorker] Resuming session ${sessionId}`);

          try {
            // 1. Get Session Context (Bypass to retrieve the target company metadata safely)
            const sessionState = await TenantContextManager.runAsSystem(async () => {
              return await flowExecutor.getSessionById(sessionId);
            });

            if (!sessionState) {
              Logger.warn(`[FlowWorker] Session ${sessionId} not found`);
              return;
            }

            const { companyId, conversationId } = sessionState;

            // Wrap all operations in the explicit Company Tenant Context to guarantee 100% RLS compliance
            await TenantContextManager.run(
              {
                companyId,
                userId: "system",
                role: "SYSTEM",
                requestId: `flow-resume-${job.id}`,
              },
              async () => {
                const conversation =
                  await chatService.getFullConversation(companyId, conversationId);

                if (!conversation) {
                  Logger.warn(
                    `[FlowWorker] Conversation ${conversationId} not found`,
                  );
                  return;
                }

                // Create/fetch Bot User Context
                const botUser = await chatService.upsertWhatsAppUser({
                  email: `bot_${companyId}@sentry.bot`,
                  name: "Flow Bot",
                  companyId,
                  role: "AGENT",
                });

                // 2. Call the executor to resume the flow under the correct company and bot user context
                const results = await TenantContextManager.run(
                  {
                    companyId,
                    userId: botUser.id,
                    role: "AGENT",
                    requestId: `flow-resume-${job.id}`,
                  },
                  async () => {
                    return await flowExecutor.resumeSession(sessionId);
                  }
                );

                // 3. Process Results (Send Messages)
                if (results && results.length > 0) {
                  for (const result of results) {
                    try {
                      if (typeof result === "string") {
                        // Text Message - Add to global outbound queue
                        await messageHandler.sendMessage(
                          conversation.channelId,
                          result,
                          {
                            companyId,
                            conversationId,
                            senderId: botUser.id,
                            metadata: { flowGenerated: true },
                          },
                        );
                      } else if (
                        result &&
                        typeof result === "object" &&
                        "type" in result
                      ) {
                        // Media Message - Add to global outbound queue
                        await messageHandler.sendMedia(
                          conversation.channelId,
                          {
                            type: result.type,
                            url: result.url,
                            caption: result.message,
                            mimetype:
                              mime.lookup(result.url) ||
                              "application/octet-stream",
                          },
                          {
                            companyId,
                            conversationId,
                            senderId: botUser.id,
                            metadata: { flowGenerated: true },
                          },
                        );
                      }
                    } catch (sendErr) {
                      Logger.error(
                        "[FlowWorker] Failed to send message:",
                        sendErr,
                      );
                    }
                  }
                }
              }
            );
          } catch (error) {
            Logger.error(
              `[FlowWorker] Error resuming session ${sessionId}:`,
              error,
            );
            throw error; // Trigger retry logic
          }
        }
      },
      {
        connection,
        concurrency: 5, // Process up to 5 concurrent flow resumes
      },
    );

    this.worker.on("completed", (job) => {
      Logger.debug(`[FlowWorker] Job ${job.id} completed successfully`);
    });

    this.worker.on("failed", (job, err) => {
      Logger.error(`[FlowWorker] Job ${job?.id} failed:`, err);
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.worker) {
      Logger.info(`[FlowWorker] Shutting down worker...`);
      await this.worker.close();
    }
  }
}

export const flowQueueWorker = new FlowQueueWorker();
