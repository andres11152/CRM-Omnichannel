import { Worker, Job, UnrecoverableError } from "bullmq";
import IORedis from "ioredis";
import { getEnv } from "@/config/env";
import { Logger } from "@/utils/logger";
import {
  SendMessageOptions,
  MediaPayload,
  MessagePayload
} from "../../../core/types/whatsapp.types";
import { OutboundMessageHandler } from "../../../providers/handlers/OutboundMessageHandler";
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
          const errMsg = error instanceof Error ? error.message : String(error);
          Logger.error(`[OutboundWorker] [ERROR] Failed to send message to ${payload.to}: ${errMsg}`);

          // Fatal errors: retrying will never succeed — mark as unrecoverable so
          // BullMQ skips remaining attempts and immediately fires the 'failed' event.
          // [SEC] "no active whatsapp session" is NOT fatal: findActiveSessionForCompany
          // returns null (and this error) during the normal auto-heal window while a
          // zombie/reconnecting socket comes back up (SessionManager kicks off a
          // background reconnect and returns null for the current call). Treating it
          // as fatal permanently discarded AI/flow-bot replies on every brief reconnect
          // blip, with zero trace (no DB row, no FAILED status, nothing in the UI).
          const FATAL_PATTERNS = [
            "not on whatsapp",
            "not-on-whatsapp",
            "invalid phone",
            "invalid number",
            "bad jid",
            "recipient is not on whatsapp",
          ];
          if (FATAL_PATTERNS.some((p) => errMsg.toLowerCase().includes(p))) {
            throw new UnrecoverableError(errMsg);
          }

          throw error; // Retriable — let BullMQ retry
        }
      },
      {
        connection: redis,
        // [SEC] Concurrency MUST be 1, mirroring messageQueueWorker.ts's fix for the
        // exact same bug class: with concurrency>1, two jobs for the same conversation
        // (e.g. a 3-message flow-bot reply) can be picked up by different workers and
        // finish their async work (JID resolution, media upload) in either order,
        // dispatching to WhatsApp out of enqueue order. A per-conversation
        // DistributedLock does NOT fix this — see messageQueueWorker.ts's comment:
        // the lock's retry/jitter has no FIFO guarantee, so lock+concurrency was tried
        // and reverted for the manual pipeline. This queue is global across companies
        // (not per-company like the manual one), so concurrency=1 serializes AI/flow
        // sends platform-wide; acceptable because these sends already carry a
        // deliberate 2-5s human-like delay (getOutboundDelayAndPriority) before
        // reaching this worker. If multi-tenant throughput becomes a bottleneck,
        // the correct fix is per-company queues like messageQueueService, not raising
        // this number back up.
        concurrency: 1,
      }
    );

    this.setupListeners();
  }

  private setupListeners() {
    this.worker.on("failed", async (job, err) => {
      Logger.error(`[OutboundWorker] Job ${job?.id} failed permanent: ${err.message}`);

      // [FIX] Update message status to FAILED in DB so UI reflects reality.
      // Without this, messages stay as "QUEUED" forever, misleading agents.
      // [SEC] dbId lives at options.metadata.dbId, not options.dbId — that's where
      // OutboundMessageHandler.sendMessage/sendMedia actually read it from
      // (handlePostSend's `dbId: metadata?.dbId`). This was reading the wrong path
      // and always finding undefined, so failed AI/flow-bot sends never got marked.
      if (job?.data?.payload?.options?.metadata?.dbId) {
        try {
          const dbId = job.data.payload.options.metadata.dbId as string;
          const companyId = job.data.payload.options.companyId as string;
          if (companyId) {
            await runWithCompanyId(companyId, async () => {
              const { messageRepository } = await import("@/repositories/MessageRepository");
              await messageRepository.update(dbId, { status: "FAILED" }).catch(() => {
                // Message may have been deleted — ignore P2025
              });
            });
          }
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
