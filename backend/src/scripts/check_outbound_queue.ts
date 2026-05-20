import dotenv from "dotenv";
dotenv.config();

import { validateEnv, getEnv } from "../config/env";
import { Queue } from "bullmq";
import IORedis from "ioredis";

async function main() {
  validateEnv();
  const env = getEnv();
  const isTls = env.REDIS_URL?.startsWith("rediss://");
  const redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    password: env.REDIS_PASSWORD || undefined,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
  });

  const queue = new Queue("whatsapp-outbound", { connection: redis });

  const jobs = await queue.getJobs(["failed"]);
  console.log(`\n=== Failed Jobs: ${jobs.length} ===`);
  for (const job of jobs) {
    console.log(`Job ID: ${job.id}`);
    console.log(`  Name: ${job.name}`);
    console.log(`  Processed On: ${job.processedOn ? new Date(job.processedOn).toISOString() : "never"}`);
    console.log(`  Finished On: ${job.finishedOn ? new Date(job.finishedOn).toISOString() : "never"}`);
    console.log(`  Failed Reason: ${job.failedReason}`);
  }

  await queue.close();
  await redis.quit();
}

main().catch(console.error);
