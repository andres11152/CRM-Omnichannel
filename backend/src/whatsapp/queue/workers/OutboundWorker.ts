import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { getEnv } from "@/config/env";
import { Logger } from "@/utils/logger";
import { 
  SendMessageOptions, 
  MediaPayload, 
  MessagePayload 
} from "../../core/types/whatsapp.types";
import { OutboundMessageHandler } from "../../providers/handlers/OutboundMessageHandler";
import { runWithCompanyId } from "@/context/requestContext";

/**
 *  OUTBOUND WORKER
 * 
 * Processes outbound messages from the CRM/AI.
 * - Handles Send Message and Send Media.
 * - Retries automatically if the socket is offline.
 * - Prevents blocking the API response while waiting for the socket.
 */
export class OutboundWorker {
  private worker: Worker;

  constructor(private outboundHandler: OutboundMessageHandler) {
    const env = getEnv();
    const isTls = env.REDIS_URL?.startsWith("rediss://");
    const redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      password: env.REDIS_PASSWORD || undefined,
      tls: isTls ? { rejectUnauthorized: false } : undefined,
    });

    redis.on("error", (err) => {
      Logger.error("[OutboundWorker] Redis Connection Error:", err);
    });

    this.worker = new Worker(
      "whatsapp-outbound",
      async (job: Job) => {
        const { type, payload } = job.data as {
          type: "text" | "media";
          payload: {
            to: string;
            content?: string;
            media?: MediaPayload;
            options: SendMessageOptions;
          };
        };

        try {
          Logger.debug(`[OutboundWorker]  Sending ${type} message to ${payload.to}...`);

          const companyId = payload.options.companyId;
          const result = await runWithCompanyId(companyId, async () => {
            if (type === "text" && payload.content) {
              return await this.outboundHandler.sendMessage(
                payload.to, 
                payload.content, 
                payload.options
              );
            } else if (type === "media" && payload.media) {
              return await this.outboundHandler.sendMedia(
                payload.to, 
                payload.media, 
                payload.options
              );
            } else {
              throw new Error(`Invalid outbound job type: ${type}`);
            }
          });

          Logger.info(`[OutboundWorker] [OK] Message sent to ${payload.to} (ID: ${result.messageId})`);
          return result;
        } catch (error) {
          Logger.error(`[OutboundWorker] [ERROR] Failed to send message to ${payload.to}: ${error instanceof Error ? error.message : error}`);
          throw error; // Let BullMQ retry
        }
      },
      { 
        connection: redis,
        concurrency: 5, // Send up to 5 messages/media concurrently
      }
    );

    this.setupListeners();
  }

  private setupListeners() {
    this.worker.on("failed", async (job, err) => {
      Logger.error(`[OutboundWorker] Job ${job?.id} failed permanent: ${err.message}`);

      // [FIX] Update message status to FAILED in DB so UI reflects reality.
      // Without this, messages stay as "QUEUED" forever, misleading agents.
      if (job?.data?.payload?.options?.dbId) {
        try {
          const { prisma } = await import("@/config/database");
          const dbId = job.data.payload.options.dbId as string;
          await prisma.message.update({
            where: { id: dbId },
            data: { status: "FAILED" },
          }).catch(() => {
            // Message may have been deleted — ignore P2025
          });
        } catch {
          // Non-critical — best effort status update
        }
      }
    });
  }

  public async close() {
    await this.worker.close();
  }
}
