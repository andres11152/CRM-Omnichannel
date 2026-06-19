// Triggering restart after node_modules restore
// [SEARCH] INITIALIZE TRACING FIRST
process.env.UV_THREADPOOL_SIZE = "16"; // Prevent Baileys AES Crypto starvation
import "./utils/tracing";

import dotenv from "dotenv";
dotenv.config();

import { initEnv } from "@/config/env";

// [SEC] VALIDATE ENV IMMEDIATELY (Fail Fast)
try {
  initEnv();
} catch (err) {
  // Logger might not be fully ready, but we use console as fallback
  console.error("[ERROR] CRITICAL: Environment validation failed at startup.");
  process.exit(1);
}

import { Logger } from "@/utils/logger";
import { connectDB, prisma } from "@/config/database";
import { connectRedis } from "@/config/redis";
import { createServer } from "http";
import v8 from "v8";

// Loaders & App
import { createApp } from "@/app/app";
import { initSocketGateway } from "@/loaders/socketLoader";
import { initWorkers } from "@/loaders/workerLoader";
import { whatsappService } from "@/whatsapp";
import { memoryMonitor } from "@/utils/resourceManager";
import { cleanupStaleTempFiles, startTempFileWatchdog } from "@/utils/audioConverter";
import { startQueueMetricsScraper } from "@/utils/metrics";

// [SEARCH] MEMORY CHECK
const heapStats = v8.getHeapStatistics();
const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
Logger.info(`[HEAP]  Max Heap Limit: ${heapLimitMB}MB`);
if (heapLimitMB < 3000) {
  Logger.warn(`[HEAP] [WARNING] Low Heap Limit. Recommend --max-old-space-size=4096`);
}

//  BOOTSTRAP
const bootstrap = async () => {
  try {
    // 1. Core Infrastructure
    await connectRedis();
    Logger.info("[Server]  Connecting to Database...");
    await connectDB();
    Logger.info("[Server] Database connected successfully");

    // 2. Initialize App & Server
    const app = createApp();
    const httpServer = createServer(app);
    const PORT = process.env.PORT || 4000;

    // 3. Loaders (Sockets, Workers, WhatsApp)
    await initSocketGateway(httpServer);

    Logger.info("[Server]  Initializing WhatsApp service...");
    await whatsappService.initialize();

    // 4. Background Services
    memoryMonitor.start(60000);

    // Cleanup stale audio conversion temp files left by previous runs (e.g. SIGKILL victims)
    await cleanupStaleTempFiles();
    startTempFileWatchdog();

    // Scrape BullMQ queue depths into Prometheus every 30s
    startQueueMetricsScraper(30_000);

    // [SEC] SCALE FIX: Only load workers if NOT running in dedicated worker mode.
    // When using separate PM2 processes (sentry-crm-api + sentry-crm-workers),
    // the API process should NOT run background jobs to prevent event loop starvation.
    const isWorkerMode = process.env.WORKER_MODE === "true";
    if (!isWorkerMode) {
      await initWorkers();
      Logger.info("[Server] Workers loaded in monolithic mode");
    } else {
      Logger.info("[Server] ⏭️ Skipping workers (running in dedicated worker process)");
    }

    // 5. Start Server
    httpServer.listen(Number(PORT), () => {
      Logger.info(`[Server] [OK] CRM SaaS Backend running on port ${PORT}`);
      // Signal PM2 that we're ready (required for wait_ready: true)
      if (process.send) {
        process.send("ready");
      }
    });

    // 6. Graceful Shutdown
    const gracefulShutdown = () => {
      Logger.info(" SIGTERM/SIGINT received. Shutting down gracefully...");
      httpServer.close(async () => {
        Logger.info(" HTTP server closed");
        // Clean up any temp audio files still on disk before exiting
        await cleanupStaleTempFiles(0).catch(() => {}); // maxAge=0 removes ALL temp files
        await prisma.$disconnect();
        Logger.info("[Server] Database disconnected");
        process.exit(0);
      });
    };

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
  } catch (err) {
    Logger.error("[Server] [ERROR] Critical error during server startup.");
    Logger.error(err);
    process.exit(1);
  }
};

// Handle Uncaught Errors (Legacy Handlers)
process.on("uncaughtException", (err: Error) => {
  const msg = err.message || "";
  const isNetworkNoise = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EPIPE"].some(e => msg.includes(e));
  if (isNetworkNoise || err.constructor?.name === "AggregateError") return;
  Logger.error("UNCAUGHT EXCEPTION! ", err);
  if (msg.includes("EADDRINUSE")) process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = String(reason);
  const isNetworkNoise = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "AggregateError"].some(e => msg.includes(e));
  if (isNetworkNoise) return;
  Logger.error("UNHANDLED REJECTION! ", reason);
});

bootstrap();
