import { createClient } from "redis";
import { Logger } from "../utils/logger";

let redisClient: ReturnType<typeof createClient> | null = null;
const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    pingInterval: 20000,
    socket: {
      connectTimeout: 60000,
      tls: (redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined) as unknown as boolean,
      keepAlive: true,
      noDelay: true,
      reconnectStrategy: (retries) => {
        return Math.min(retries * 100, 5000);
      },
    } as unknown as import("redis").RedisClientOptions["socket"],
    disableOfflineQueue: true,
  });

  redisClient.on("error", (err) => {
    const msg = err.message || "";
    const isNetworkError = [
      "ECONNRESET", "ETIMEDOUT", "Socket closed", "ENOTFOUND", 
      "ECONNABORTED", "ECONNREFUSED", "getaddrinfo", "Connection timeout", "EPIPE",
      "AggregateError"
    ].some(e => msg.includes(e));

    if (isNetworkError || err.constructor?.name === "AggregateError") {
      return;
    }
    
    Logger.error(err, "[Redis] Client Error");
  });

  redisClient.on("ready", () => {
    Logger.info("[Redis] Connection fully ready");
  });
}

export const connectRedis = async () => {
  if (!redisClient) {
    Logger.warn("[Redis] REDIS_URL not set. Running in Fallback Mode.");
    return;
  }

  if (redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.connect();
    Logger.info("[Redis] Client Connected");
  } catch (err) {
    Logger.error(err, "[Redis] Failed to connect:");
  }
};

export default redisClient;
