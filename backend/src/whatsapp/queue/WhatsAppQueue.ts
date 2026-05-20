import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { getEnv } from "@/config/env";
import { Logger } from "@/utils/logger";

/**
 *  WHATSAPP QUEUE MANAGER
 * 
 * Manages BullMQ instances for asynchronous processing of WhatsApp messages.
 * Decouples the Baileys socket from heavy business logic.
 */
class WhatsAppQueueManager {
  private static instance: WhatsAppQueueManager | null = null;
  private redisConnection: IORedis;

  // Queues
  public inboundQueue: Queue;
  public outboundQueue: Queue;

  // Events (for monitoring)
  public inboundEvents: QueueEvents;

  private constructor() {
    const env = getEnv();
    const isTls = env.REDIS_URL?.startsWith("rediss://");
    
    this.redisConnection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // REQUIRED for BullMQ
      password: env.REDIS_PASSWORD || undefined,
      tls: isTls ? { rejectUnauthorized: false } : undefined,
    });

    this.redisConnection.on("error", (err) => {
      Logger.error("[WhatsAppQueue] Redis Connection Error:", err);
    });

    //  INBOUND: (Baileys Event) -> Redis -> Worker (AI/DB)
    this.inboundQueue = new Queue("whatsapp-inbound", {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: { count: 1000 },
      },
    });

    //  OUTBOUND: (CRM/AI) -> Redis -> Socket Send
    this.outboundQueue = new Queue("whatsapp-outbound", {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: { count: 5000 },
      },
    });

    this.inboundEvents = new QueueEvents("whatsapp-inbound", {
      connection: this.redisConnection,
    });

    this.setupListeners();
  }

  public static getInstance(): WhatsAppQueueManager {
    if (!WhatsAppQueueManager.instance) {
      WhatsAppQueueManager.instance = new WhatsAppQueueManager();
    }
    return WhatsAppQueueManager.instance;
  }

  private setupListeners() {
    this.inboundEvents.on("failed", ({ jobId, failedReason }) => {
      Logger.error(`[WhatsAppQueue] [ERROR] Inbound job ${jobId} failed: ${failedReason}`);
    });
  }

  public async close() {
    await this.inboundQueue.close();
    await this.outboundQueue.close();
    await this.redisConnection.quit();
  }
}

export const getWhatsAppQueue = () => WhatsAppQueueManager.getInstance();
