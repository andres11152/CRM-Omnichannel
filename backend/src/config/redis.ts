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
    disableOfflineQueue: false,
  });

  redisClient.on("error", (err) => {
    // 🤫 SILENCE KNOWN NETWORK NOISE (Expected in cloud environments)
    const msg = err.message || "";
    const silentErrors = [
      "ECONNRESET",
      "ETIMEDOUT",
      "Socket closed",
      "Socket closed unexpectedly", // 🛡️ Cloud Redis TLS disconnects
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
    // Only log if it's NOT a silent error (Double check logic)
    if (!silentErrors.some((e) => String(err).includes(e))) {
      Logger.error("[Redis] Client Error", err);
    }
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
  } catch {
    Logger.warn("[Redis] Failed to connect. Will run in Memory/File Mode.");
    // We intentionally catch this so we don't crash the server startup
    // The app should be able to run without Redis (using in-memory fallbacks)
  }
};

export default redisClient;
