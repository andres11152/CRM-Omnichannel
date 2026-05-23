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

  console.log("Cleaning whatsapp-outbound queue...");
  
  const failedJobs = await queue.getJobs(["failed"]);
  console.log(`Found ${failedJobs.length} failed jobs. Removing...`);
  for (const job of failedJobs) {
    await job.remove();
  }

  const activeJobs = await queue.getJobs(["active", "waiting", "delayed"]);
  console.log(`Found ${activeJobs.length} active/waiting/delayed jobs. Removing...`);
  for (const job of activeJobs) {
    await job.remove();
  }

  console.log("whatsapp-outbound queue cleaned successfully!");

  await queue.close();
  await redis.quit();
}

main().catch(console.error);
