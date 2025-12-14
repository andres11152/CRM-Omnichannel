import { createClient } from "redis";
import { Logger } from "@/utils/logger";

let redisClient: ReturnType<typeof createClient> | null = null;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    pingInterval: 10000, // 🔥 Send PING every 10s to keep connection alive (Application Layer)
    socket: {
      connectTimeout: 50000, // 50s timeout
      tls: redisUrl.startsWith("rediss://"),
      rejectUnauthorized: false,
      reconnectStrategy: (retries) => {
        const delay = Math.min(retries * 500, 5000);
        return delay;
      },
    },
    // Prevent crashing on command failure, just fail the command
    disableOfflineQueue: false,
  });

  redisClient.on("error", (err) => {
    // 🤫 SILENCE KNOWN NETWORK NOISE
    if (
      err.message?.includes("ECONNRESET") ||
      err.message?.includes("ETIMEDOUT") ||
      err.message?.includes("Socket closed unexpectedly")
    ) {
      // These are routine network blips. Auto-reconnect handles them.
      // Only log if you really want to debug network stability.
      return;
    }
    Logger.error("[Redis] Client Error", err);
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
