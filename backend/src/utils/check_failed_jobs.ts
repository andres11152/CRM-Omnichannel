import dotenv from "dotenv";
dotenv.config();
import { initEnv } from "../config/env";
initEnv();

import IORedis from "ioredis";
import { getEnv } from "../config/env";

async function run() {
  const env = getEnv();
  const redis = new IORedis(env.REDIS_URL, {
    password: env.REDIS_PASSWORD || undefined,
  });

  try {
    console.log("Connecting to Redis...");
    const keys = await redis.keys("*");
    console.log("Total Redis keys count:", keys.length);

    const bullKeys = keys.filter(k => k.toLowerCase().includes("bull"));
    console.log("Bull keys (first 30):", bullKeys.slice(0, 30));

    const waKeys = keys.filter(k => k.toLowerCase().includes("wa"));
    console.log("WhatsApp/wa keys (first 30):", waKeys.slice(0, 30));

  } catch (err) {
    console.error(err);
  } finally {
    redis.disconnect();
  }
}

run();
