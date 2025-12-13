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
          return new Error("Max retries reached");
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

  redisClient.on("connect", () => Logger.info("✅ Redis Client Connected"));

  // Async connect to avoid top-level blocking
  (async () => {
    try {
      await redisClient?.connect();
    } catch (e) {
      Logger.warn(
        "[Redis] Failed to connect initially. Will run in Memory/File Mode."
      );
    }
  })();
} else {
  Logger.warn(
    "[Redis] REDIS_URL not set. Running in Fallback Mode (Memory/File)."
  );
}

export default redisClient;
