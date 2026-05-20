import dotenv from "dotenv";
dotenv.config();
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { initEnv, getEnv } from "../config/env";

async function run() {
  initEnv();
  const env = getEnv();
  const isTls = env.REDIS_URL?.startsWith("rediss://");
  const redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    password: env.REDIS_PASSWORD || undefined,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
  });

  const outboundQueue = new Queue("whatsapp-outbound", { connection: redis });

  try {
    const failed = await outboundQueue.getFailed();
    console.log(`Failed jobs count: ${failed.length}`);
    for (const job of failed) {
      console.log(`Job ID: ${job.id}`);
      console.log(`Timestamp: ${new Date(job.timestamp).toISOString()}`);
      console.log(`Failed Reason: ${job.failedReason}`);
      console.log(`Data:`, JSON.stringify(job.data, null, 2));
      console.log("-----------------------------------------");
    }
  } catch (err) {
    console.error("Error reading queue:", err);
  } finally {
    await outboundQueue.close();
    await redis.quit();
  }
}

run();
