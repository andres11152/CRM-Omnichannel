import { Queue } from "bullmq";
import IORedis from "ioredis";
import { Logger } from "../utils/logger";

let redisConnection: IORedis | null = null;
let inboundQueue: Queue | null = null;
let historySyncQueue: Queue | null = null;
let outboundCallbackQueue: Queue | null = null;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  const isTls = redisUrl.startsWith("rediss://");
  redisConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
    password: process.env.REDIS_PASSWORD || undefined,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
  });

  redisConnection.on("error", (err) => {
    Logger.error(err, "[Queues] Redis Connection Error:");
  });

  inboundQueue = new Queue("whatsapp-inbound", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  });

  historySyncQueue = new Queue("whatsapp-history-sync", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  });

  outboundCallbackQueue = new Queue("whatsapp-outbound-callback", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  });
}

export const getInboundQueue = () => inboundQueue;
export const getHistorySyncQueue = () => historySyncQueue;
export const getOutboundCallbackQueue = () => outboundCallbackQueue;
export const getRedisConnection = () => redisConnection;
