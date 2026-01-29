import { createClient } from "redis";
import { Logger } from "@/utils/logger";

let redisClient: ReturnType<typeof createClient> | null = null;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    pingInterval: 5000, // 🔥 Send PING every 5s (prevents cloud idle disconnections)
    socket: {
      connectTimeout: 60000, // 60s timeout
      tls: redisUrl.startsWith("rediss://"), // Auto-detect TLS
      rejectUnauthorized: false, // Required for self-signed certs
      keepAlive: 10000, // 🔥 TCP keepAlive every 10s (CRITICAL for cloud providers)
      noDelay: true, // Disable Nagle's algorithm for faster response
      reconnectStrategy: (retries) => {
        // Exponential backoff: 100ms, 200ms, 400ms... max 5s
        const delay = Math.min(retries * 100, 5000);
        Logger.info(
          `[Redis] Reconnecting in ${delay}ms (attempt ${retries})...`,
        );
        return delay;
      },
    },
    // Prevent crashing on command failure, just fail the command
    disableOfflineQueue: false,
  });

  redisClient.on("error", (err) => {
    // 🤫 SILENCE KNOWN NETWORK NOISE (Expected in cloud environments)
    const msg = err.message || "";
    const silentErrors = [
      "ECONNRESET",
      "ETIMEDOUT",
      "Socket closed",
      "ENOTFOUND",
      "ECONNABORTED",
      "getaddrinfo",
      "Connection timeout",
      "socket hang up",
      "ECONNREFUSED",
      "EPIPE",
      "read ECONNRESET",
      "write ECONNRESET",
    ];

    if (silentErrors.some((e) => msg.includes(e))) {
      // These are routine network blips. Auto-reconnect handles them silently.
      return;
    }
    Logger.error("[Redis] Client Error", err);
  });

  redisClient.on("reconnecting", () => {
    Logger.warn("[Redis] Reconnecting...");
  });

  redisClient.on("ready", () => {
    Logger.info("[Redis] ✅ Connection ready");
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
    Logger.info("✅ Redis Client Connected");
  } catch (e) {
    Logger.warn("[Redis] Failed to connect. Will run in Memory/File Mode.");
    // We intentionally catch this so we don't crash the server startup
    // The app should be able to run without Redis (using in-memory fallbacks)
  }
};

export default redisClient;
