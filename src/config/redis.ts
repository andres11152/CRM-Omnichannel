import { createClient } from "redis";
import { Logger } from "@/utils/logger";

let redisClient: ReturnType<typeof createClient> | null = null;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 5) {
          Logger.warn("[Redis] Max retries reached, disabling Redis.");
          // return new Error("Max retries reached"); // Don't throw, just stop
          return false;
        }
        return Math.min(retries * 100, 2000);
      },
      connectTimeout: 5000, // 5s timeout
    },
  });

  redisClient.on("error", (err) => {
    // Suppress common connection refused errors to avoid log spam
    if (err.message?.includes("ECONNREFUSED")) {
      // console.warn("[Redis] Connection refused. Is Redis running?");
    } else {
      Logger.error("[Redis] Client Error", err);
    }
  });
}

export const connectRedis = async () => {
  if (!redisClient) {
    Logger.warn(
      "[Redis] REDIS_URL not set. Running in Fallback Mode (Memory/File)."
    );
    return;
  }

  if (redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.connect();
    Logger.info("✅ Redis Client Connected");
  } catch (e) {
    Logger.warn("[Redis] Failed to connect. Will run in Memory/File Mode.");
    // We intentionally catch this so we don't crash the server startup
    // The app should be able to run without Redis (using in-memory fallbacks)
  }
};

export default redisClient;
