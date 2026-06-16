import IORedis from "ioredis";
import { Logger } from "@/utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const isTls = redisUrl.startsWith("rediss://");

/**
 * [SEC] BullMQ Redis Connection (ioredis)
 * - Handles TLS (rediss://) for Render/production Redis
 * - Exponential backoff with max retries to avoid log spam
 * - Graceful degradation: if Redis is unreachable, queues will fail
 *   but the main server won't crash
 */
export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: true,
  // TLS config for Render's managed Redis (rediss:// scheme)
  ...(isTls && {
    tls: {
      rejectUnauthorized: false, // Render uses self-signed certs
    },
  }),
  retryStrategy: (times: number) => {
    if (times > 15) {
      // After 15 retries (~2 min), stop retrying silently
      Logger.warn("[BullMQ] Redis unreachable after 15 retries. Queues disabled.");
      return null; // Stop reconnecting
    }
    return Math.min(times * 500, 10000); // Exponential backoff, max 10s
  },
});

// Type Guard for NodeJS System Errors to avoid 'any'
function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** Track if we've already logged the connection failure to avoid spam */
let hasLoggedConnectionFailure = false;

connection.on("error", (err) => {
  // Silence known network errors (ECONNREFUSED, ETIMEDOUT, DNS, etc.)
  if (isSystemError(err)) {
    const silentCodes = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "ECONNABORTED"];
    if (err.code && silentCodes.includes(err.code)) {
      if (!hasLoggedConnectionFailure) {
        hasLoggedConnectionFailure = true;
        Logger.warn(`[BullMQ] Redis connection failed (${err.code}). Queue operations will be unavailable.`);
      }
      return;
    }
  }
  Logger.error("[BullMQ] Redis Connection Error", err);
});

connection.on("ready", () => {
  hasLoggedConnectionFailure = false; // Reset on successful connection
  Logger.info("[BullMQ] Redis Connection Ready");
});
