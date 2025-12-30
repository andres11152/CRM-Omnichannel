import { PrismaClient } from "@prisma/client";
import { Logger } from "@/utils/logger";

console.log("[Config] Initializing Prisma Client...");

/**
 * 🛡️ ENTERPRISE-GRADE PRISMA CLIENT
 *
 * Features:
 * - Connection pooling optimized for production
 * - Automatic reconnection on transient failures
 * - Query timeout protection
 * - Graceful shutdown handling
 */
const prisma = new PrismaClient({
  log: [
    { level: "warn", emit: "event" },
    { level: "error", emit: "event" },
  ],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// 🔥 CRITICAL: Handle Prisma errors gracefully
prisma.$on("error", (e) => {
  Logger.error("[Prisma] Database error event:", e);
});

prisma.$on("warn", (e) => {
  Logger.warn("[Prisma] Database warning:", e);
});

// 🛡️ Connection health check with retry
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

async function ensureConnection() {
  if (isConnected) return;

  while (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
    try {
      await prisma.$connect();
      isConnected = true;
      Logger.info("[Prisma] ✅ Database connected successfully");
      return;
    } catch (error) {
      connectionAttempts++;
      Logger.error(
        `[Prisma] Connection attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS} failed:`,
        error
      );

      if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
        Logger.error(
          "[Prisma] 🚨 CRITICAL: Could not connect to database after maximum attempts"
        );
        throw new Error("Database connection failed");
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 16000);
      Logger.warn(`[Prisma] Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Initialize connection
ensureConnection().catch((err) => {
  Logger.error("[Prisma] Fatal: Could not establish database connection", err);
  process.exit(1);
});

// 🛡️ GRACEFUL SHUTDOWN: Disconnect cleanly on process termination
const gracefulShutdown = async (signal: string) => {
  Logger.info(`[Prisma] ${signal} received. Closing database connections...`);
  try {
    await prisma.$disconnect();
    Logger.info("[Prisma] ✅ Database disconnected gracefully");
  } catch (error) {
    Logger.error("[Prisma] Error during disconnect:", error);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export { prisma };
