import { createClient } from "redis";
import { Logger } from "@/utils/logger";

let redisClient: ReturnType<typeof createClient> | null = null;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    pingInterval: 20000, // 20s Ping (Less aggressive)
    socket: {
      connectTimeout: 60000,
      tls: redisUrl.startsWith("rediss://"),
      rejectUnauthorized: false,
      keepAlive: 30000, // 30s KeepAlive (Standard)
      noDelay: true,
      reconnectStrategy: (retries) => {
        const delay = Math.min(retries * 100, 5000);
        // Logger.info(`[Redis] Reconnecting in ${delay}ms...`); // Reduce spam
        return delay;
      },
    },
    // Prevent crashing on command failure, just fail the command
    disableOfflineQueue: true, // [SEC] Don't queue commands if Redis is down
  });

  redisClient.on("error", (err) => {
    const msg = err.message || "";
    //  SILENCE DNS AND NETWORK NOISE
    const isNetworkError = [
      "ECONNRESET", "ETIMEDOUT", "Socket closed", "ENOTFOUND", 
      "ECONNABORTED", "getaddrinfo", "Connection timeout", "EPIPE"
    ].some(e => msg.includes(e));

    if (isNetworkError) {
      // Logic: Only log network issues once to avoid spamming 1000 lines/sec
      return;
    }
    
    Logger.error("[Redis] Client Error", err);
  });

  redisClient.on("reconnecting", () => {
    // Silent reconnection
  });

  redisClient.on("ready", () => {
    Logger.info("[Redis] [OK] Connection fully ready");
  });
}

export const connectRedis = async () => {
  if (!redisClient) {
    Logger.warn(
      "[Redis] REDIS_URL not set. Running in Fallback Mode (Memory/File).",
    );
    return;
  }

  if (redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.connect();
    Logger.info("[OK] Redis Client Connected");
  } catch {
    Logger.warn("[Redis] Failed to connect. Will run in Memory/File Mode.");
    // We intentionally catch this so we don't crash the server startup
    // The app should be able to run without Redis (using in-memory fallbacks)
  }
};

export default redisClient;
