import IORedis from "ioredis";
import { Logger } from "@/utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Type Guard for NodeJS System Errors to avoid 'any'
function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

connection.on("error", (err) => {
  // Silence known connection errors during startup/shutdown
  if (isSystemError(err) && err.code === "ECONNREFUSED") {
    return;
  }
  Logger.error("[BullMQ] Redis Connection Error", err);
});

connection.on("ready", () => {
  Logger.info("[BullMQ] Redis Connection Ready");
});
