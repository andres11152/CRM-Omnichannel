import { createClient } from "redis";
import { Logger } from "@/utils/logger";

let redisClient: ReturnType<typeof createClient> | null = null;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    pingInterval: 1000, // 🔥 Send PING every 1s (CRITICAL for Render External URL)
    socket: {
      connectTimeout: 50000, // 50s timeout
      tls: redisUrl.startsWith("rediss://"), // Auto-detect TLS
      rejectUnauthorized: false, // Required for self-signed certs
      reconnectStrategy: (retries) => {
        // Aggressive reconnect for local dev stability
        return Math.min(retries * 50, 2000);
      },
    },
    // Prevent crashing on command failure, just fail the command
    disableOfflineQueue: false,
  });

  redisClient.on("error", (err) => {
    // 🤫 SILENCE KNOWN NETWORK NOISE
    const msg = err.message || "";
    if (
      msg.includes("ECONNRESET") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("Socket closed") ||
      msg.includes("ENOTFOUND") || // DNS Error (Network Down)
      msg.includes("ECONNABORTED") || // Connection Dropped
      msg.includes("getaddrinfo") ||
      msg.includes("Connection timeout")
    ) {
      // These are routine network blips or outages. Auto-reconnect handles them.
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
