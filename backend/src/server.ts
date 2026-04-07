// [SEARCH] INITIALIZE TRACING FIRST
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
    Logger.info("[Server] [OK] Database connected successfully");

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
    await initWorkers();

    // 5. Start Server
    httpServer.listen(Number(PORT), () => {
      Logger.info(`[OK] ¡ÉXITO! CRM SaaS Backend corriendo en el puerto ${PORT}`);
    });

    // 6. Graceful Shutdown
    const gracefulShutdown = () => {
      Logger.info(" SIGTERM/SIGINT received. Shutting down gracefully...");
      httpServer.close(async () => {
        Logger.info(" HTTP server closed");
        await prisma.$disconnect();
        Logger.info("[SAVE] Database disconnected");
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
  if (err.message?.includes("ECONNRESET") || err.message?.includes("ETIMEDOUT"))
    return;
  Logger.error("UNCAUGHT EXCEPTION! ", err);
  if (err.message?.includes("EADDRINUSE")) process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  if (String(reason).includes("ECONNRESET")) return;
  Logger.error("UNHANDLED REJECTION! ", reason);
});

bootstrap();
