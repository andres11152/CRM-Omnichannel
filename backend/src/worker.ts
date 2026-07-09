/**
 * [WORKER] DEDICATED WORKER ENTRY POINT
 *
 * This file is the entry point for the `sentry-crm-workers` PM2 process.
 * It runs ONLY background workers (message queues, flow engine, cron jobs)
 * WITHOUT starting the HTTP server or WebSocket gateway.
 *
 * Architecture:
 * - sentry-crm-api  → HTTP + WebSocket + WhatsApp Sessions (server.ts)
 * - sentry-crm-workers → Background Queues + Flows + Cron (worker.ts) ← THIS FILE
 *
 * This separation prevents CPU-heavy background jobs from starving
 * the API event loop, which is critical for real-time chat responsiveness.
 *
 * NOTE: In the current architecture, WhatsApp sessions are managed by
 * the API process (server.ts). Workers communicate with WhatsApp
 * through the Bull message queue. If you need workers to have direct
 * WhatsApp socket access, keep using the monolithic server.ts with
 * WORKER_MODE=false (default).
 */

process.env.UV_THREADPOOL_SIZE = "8"; // Workers need fewer libuv threads
import "./utils/tracing";

import dotenv from "dotenv";
dotenv.config();

import { Logger } from "@/utils/logger";
import { initEnv } from "@/config/env";

try {
  initEnv();
} catch (err) {
  Logger.error("[ERROR] CRITICAL: Environment validation failed in worker.", err as Error);
  process.exit(1);
}

import { connectDB, prisma } from "@/config/database";
import { connectRedis } from "@/config/redis";
import { memoryMonitor } from "@/utils/resourceManager";

const bootstrapWorker = async () => {
  try {
    Logger.info("[Worker] [WORKER] Starting Sentry CRM Worker Process...");

    // 1. Core Infrastructure
    await connectRedis();
    Logger.info("[Worker] [DB] Connecting to Database...");
    await connectDB();
    Logger.info("[Worker] Database connected successfully");

    // 2. Start Memory Monitor (lower interval for workers)
    memoryMonitor.start(120000); // Check every 2 minutes

    // 3. Initialize Workers
    const { initWorkers } = await import("@/loaders/workerLoader");
    await initWorkers();

    Logger.info("[Worker] [OK] Worker Process fully initialized");

    // 4. Signal PM2 that we're ready
    if (process.send) {
      process.send("ready");
    }

    // 5. Graceful Shutdown
    const gracefulShutdown = () => {
      Logger.info("[Worker] [SHUTDOWN] SIGTERM/SIGINT received. Shutting down...");
      prisma.$disconnect().then(() => {
        Logger.info("[Worker] Database disconnected");
        process.exit(0);
      });
    };

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
  } catch (err) {
    Logger.error("[Worker] [ERROR] Critical error during worker startup.", err);
    process.exit(1);
  }
};

// Handle Uncaught Errors
process.on("uncaughtException", (err: Error) => {
  const msg = err.message || "";
  const isNetworkNoise = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EPIPE"].some(e => msg.includes(e));
  if (isNetworkNoise || err.constructor?.name === "AggregateError") return;
  Logger.error("[Worker] UNCAUGHT EXCEPTION!", err);
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = String(reason);
  const isNetworkNoise = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "AggregateError"].some(e => msg.includes(e));
  if (isNetworkNoise) return;
  Logger.error("[Worker] UNHANDLED REJECTION!", reason);
});

bootstrapWorker();
