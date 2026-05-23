import dotenv from "dotenv";
dotenv.config();

import { prisma } from "../config/database";
import redisClient, { connectRedis } from "../config/redis";
import { Logger } from "../utils/logger";

async function run() {
  console.log("Starting health debug script...");
  
  // Test DB
  const dbStart = Date.now();
  try {
    console.log("Checking DB direct connection...");
    await prisma.$queryRaw`SELECT 1`;
    console.log(`DB OK! Latency: ${Date.now() - dbStart}ms`);
  } catch (err) {
    console.error("DB FAILED:", err);
  }

  // Test Redis
  console.log("Connecting Redis...");
  await connectRedis();
  
  const redisStart = Date.now();
  try {
    if (!redisClient) {
      console.log("Redis client is not configured.");
    } else {
      console.log("Redis client isOpen status:", redisClient.isOpen);
      console.log("Checking Redis ping...");
      
      const pingPromise = redisClient.ping();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Redis Ping Timeout after 5s")), 5000)
      );
      
      const res = await Promise.race([pingPromise, timeoutPromise]);
      console.log(`Redis OK! Ping response: ${res}. Latency: ${Date.now() - redisStart}ms`);
    }
  } catch (err) {
    console.error("Redis FAILED:", err);
  }

  await prisma.$disconnect();
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
  }
  process.exit(0);
}

run().catch(console.error);
