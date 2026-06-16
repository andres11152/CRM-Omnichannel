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
      "ECONNABORTED", "ECONNREFUSED", "getaddrinfo", "Connection timeout", "EPIPE",
      "AggregateError"
    ].some(e => msg.includes(e));

    // Also catch AggregateError by constructor name (Node.js wraps multiple connection failures)
    if (isNetworkError || err.constructor?.name === "AggregateError") {
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

    // Iniciar Monitoreo de Memoria
    startMemoryMonitor();
  } catch {
    Logger.warn("[Redis] Failed to connect. Will run in Memory/File Mode.");
    // We intentionally catch this so we don't crash the server startup
    // The app should be able to run without Redis (using in-memory fallbacks)
  }
};

/**
 * [SEC] REDIS MEMORY MONITOR
 * Verifica la salud y capacidad de Redis periódicamente para evitar Out Of Memory (OOM).
 */
const startMemoryMonitor = () => {
  const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Revisar cada 5 minutos

  setInterval(async () => {
    if (!redisClient || !redisClient.isOpen) return;

    try {
      const info = await redisClient.info("memory");
      
      const extractValue = (key: string) => {
        const match = info.match(new RegExp(`${key}:(\\d+)`));
        return match ? parseInt(match[1], 10) : null;
      };

      const usedMemory = extractValue("used_memory");
      const maxMemory = extractValue("maxmemory");

      if (usedMemory !== null && maxMemory !== null && maxMemory > 0) {
        const usagePercentage = (usedMemory / maxMemory) * 100;

        if (usagePercentage >= 80) {
          Logger.error(`[CRITICAL] REDIS MEMORY LIMIT REACHED! Usando ${usagePercentage.toFixed(2)}% de la capacidad máxima. Por favor purga cachés o escala Redis.`);
        } else if (usagePercentage >= 70) {
          Logger.warn(`[WARNING] Redis Memory Warning. Usando ${usagePercentage.toFixed(2)}% de la capacidad.`);
        }
      }
    } catch (error) {
      Logger.warn("[Redis] Memory Check Failed", error);
    }
  }, CHECK_INTERVAL_MS);
};

export default redisClient;
